// ============================================================================
// Vista: Historial (lista de sesiones, detalle de sesión, progreso por ejercicio)
// ============================================================================

import { WorkoutSessions, WorkoutSets, Exercises } from "../db.js";
import {
  el, clear, loading, fmt, fmtDate, toast, showError, confirmAction, emptyState,
} from "../utils.js";
import { navigate } from "../router.js";
import { lineChart, CHART_COLORS } from "../charts.js";

// Punto de entrada: si hay param es detalle de sesión; si no, la lista.
export async function renderHistory(root, param) {
  if (param) return renderSessionDetail(root, param);
  return renderList(root);
}

// ---------------------------------------------------------------------------
async function renderList(root) {
  loading(root);
  const [sessions, exercises] = await Promise.all([
    WorkoutSessions.list(200),
    Exercises.list({ includeInactive: true }),
  ]);
  // Contar series por sesión (una consulta ligera por lote sería ideal; aquí
  // hacemos una sola lectura de todas las series recientes).
  clear(root);
  root.append(el("h1", { class: "view-title" }, "Historial"));

  // ---- Progreso por ejercicio ---------------------------------------------
  root.append(progressCard(exercises));

  // ---- Lista de sesiones ---------------------------------------------------
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, `Sesiones (${sessions.length})`));
  if (!sessions.length) {
    card.append(emptyState("Sin entrenos registrados", "Registra el primero en 'Registrar entreno'."));
    root.append(card);
    return;
  }
  for (const s of sessions) {
    card.append(el("div", {
      class: "list-row list-row--tap",
      on: { click: () => navigate("/history/" + s.id) },
    }, [
      el("div", { class: "list-row__main" }, [
        el("div", { class: "list-row__title" }, s.routine_day?.name || "Sesión libre"),
        el("div", { class: "list-row__sub" }, fmtDate(s.session_date) + (s.notes ? " · " + s.notes : "")),
      ]),
      el("div", { class: "list-row__actions" }, el("span", { class: "chevron" }, "›")),
    ]));
  }
  root.append(card);
}

function progressCard(exercises) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Progreso por ejercicio"));
  if (!exercises.length) {
    card.append(el("p", { class: "muted" }, "No hay ejercicios."));
    return card;
  }
  const sel = el("select", {});
  sel.append(el("option", { value: "" }, "— Elige un ejercicio —"));
  exercises.forEach((ex) => sel.append(el("option", { value: ex.id }, ex.name)));
  card.append(el("label", { class: "field field--wide" }, [el("span", {}, "Ejercicio"), sel]));

  const chartHost = el("div", {});
  card.append(chartHost);

  sel.addEventListener("change", async () => {
    if (!sel.value) { clear(chartHost); return; }
    loading(chartHost);
    try {
      const hist = await WorkoutSets.history(sel.value);
      renderProgress(chartHost, hist);
    } catch (e) { showError(e); }
  });
  return card;
}

function renderProgress(host, hist) {
  clear(host);
  if (!hist.length) {
    host.append(el("p", { class: "muted" }, "Aún no hay series registradas de este ejercicio."));
    return;
  }
  // Agrupar por fecha de sesión: peso máximo y volumen total (Σ peso×reps).
  const byDate = new Map();
  for (const s of hist) {
    const d = s.session?.session_date;
    if (!d) continue;
    const g = byDate.get(d) || { maxWeight: 0, volume: 0, topReps: 0 };
    if (s.weight_kg != null) g.maxWeight = Math.max(g.maxWeight, Number(s.weight_kg));
    if (s.weight_kg != null && s.reps != null) g.volume += Number(s.weight_kg) * Number(s.reps);
    if (s.reps != null) g.topReps = Math.max(g.topReps, Number(s.reps));
    byDate.set(d, g);
  }
  const dates = [...byDate.keys()].sort();
  const labels = dates.map(fmtDate);

  const c1 = el("canvas");
  host.append(el("h3", { class: "sub" }, "Peso máximo por sesión (kg)"));
  host.append(el("div", { class: "chart-wrap" }, c1));

  const c2 = el("canvas");
  host.append(el("h3", { class: "sub" }, "Volumen total por sesión (kg·reps)"));
  host.append(el("div", { class: "chart-wrap" }, c2));

  queueMicrotask(() => {
    lineChart(c1, {
      labels,
      datasets: [{ label: "Peso máx (kg)", data: dates.map((d) => byDate.get(d).maxWeight), color: CHART_COLORS.weight }],
      height: 240,
    });
    lineChart(c2, {
      labels,
      datasets: [{ label: "Volumen", data: dates.map((d) => byDate.get(d).volume), color: CHART_COLORS.volume, fill: true }],
      height: 220,
    });
  });
}

// ---------------------------------------------------------------------------
async function renderSessionDetail(root, sessionId) {
  loading(root);
  let session, sets;
  try {
    [session, sets] = await Promise.all([
      WorkoutSessions.get(sessionId),
      WorkoutSets.bySession(sessionId),
    ]);
  } catch (err) {
    clear(root);
    root.append(emptyState("Sesión no encontrada", err?.message || ""));
    root.append(el("a", { class: "btn", href: "#/history" }, "← Volver"));
    return;
  }

  clear(root);
  root.append(el("a", { class: "back-link", href: "#/history" }, "← Historial"));
  root.append(el("h1", { class: "view-title" }, session.routine_day?.name || "Sesión"));
  root.append(el("p", { class: "muted" }, fmtDate(session.session_date) + (session.notes ? " · " + session.notes : "")));

  if (!sets.length) {
    root.append(emptyState("Esta sesión no tiene series registradas"));
  } else {
    // Agrupar por ejercicio conservando orden de aparición.
    const groups = new Map();
    for (const s of sets) {
      const key = s.exercise_id;
      if (!groups.has(key)) groups.set(key, { name: s.exercise?.name || "(ejercicio)", rows: [] });
      groups.get(key).rows.push(s);
    }
    for (const { name, rows } of groups.values()) {
      const card = el("div", { class: "card" });
      card.append(el("h2", { class: "card__title" }, name));
      const table = el("table", { class: "table table--compact" });
      table.append(el("thead", {}, el("tr", {}, ["Serie", "Kg", "Reps", "Fallo", "RPE"].map((h) => el("th", {}, h)))));
      const tbody = el("tbody");
      rows.sort((a, b) => a.set_number - b.set_number).forEach((s) => {
        tbody.append(el("tr", {}, [
          el("td", {}, String(s.set_number)),
          el("td", {}, fmt(s.weight_kg)),
          el("td", {}, s.reps ?? "—"),
          el("td", {}, s.is_failure ? "✓" : ""),
          el("td", {}, s.rpe ?? "—"),
        ]));
      });
      table.append(tbody);
      card.append(el("div", { class: "table-wrap" }, table));
      root.append(card);
    }
  }

  root.append(el("div", { class: "grid grid--actions" }, [
    el("button", { class: "btn", on: { click: () => navigate("/workout") } }, "Editar / añadir series"),
    el("button", {
      class: "btn btn--danger",
      on: { click: async () => {
        if (!confirmAction("¿Eliminar esta sesión y todas sus series?")) return;
        try { await WorkoutSessions.remove(session.id); toast("Sesión eliminada"); navigate("/history"); }
        catch (e) { showError(e); }
      } },
    }, "Eliminar sesión"),
  ]));
}
