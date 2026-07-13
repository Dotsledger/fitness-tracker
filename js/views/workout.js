// ============================================================================
// Vista: Registrar entrenamiento
// ============================================================================
// Flujo: elige fecha + día de rutina → "Empezar". Se crea (o reabre) la sesión.
// Por cada ejercicio del día se muestran filas de series pre-rellenadas con lo
// de la última vez. Cada ejercicio se guarda con su botón (borra+inserta sus
// series en esa sesión: idempotente y a prueba de toques repetidos).
// ============================================================================

import {
  RoutineDays, RoutineExercises, WorkoutSessions, WorkoutSets,
} from "../db.js";
import {
  el, clear, loading, today, fmtDate, toast, showError, confirmAction, emptyState,
} from "../utils.js";
import { navigate } from "../router.js";

export async function renderWorkout(root) {
  loading(root);
  const days = await RoutineDays.list();
  clear(root);
  root.append(el("h1", { class: "view-title" }, "Registrar entreno"));

  if (!days.length) {
    root.append(emptyState("No hay días de rutina activos", "Crea uno en la sección Rutina."));
    root.append(el("a", { class: "btn btn--primary", href: "#/routine" }, "Ir a Rutina →"));
    return;
  }

  // ---- Selector de sesión --------------------------------------------------
  const setup = el("div", { class: "card" });
  setup.append(el("h2", { class: "card__title" }, "Nueva sesión"));
  const form = el("form", { class: "inline-form inline-form--wrap" });
  const dateInput = el("input", { type: "date", value: today() });
  const daySel = el("select", {});
  days.forEach((d) => daySel.append(el("option", { value: d.id }, d.name)));
  form.append(
    el("label", { class: "field" }, [el("span", {}, "Fecha"), dateInput]),
    el("label", { class: "field" }, [el("span", {}, "Día"), daySel]),
    el("button", { type: "submit", class: "btn btn--primary" }, "Empezar")
  );
  setup.append(form);
  root.append(setup);

  const sessionHost = el("div", { id: "session-host" });
  root.append(sessionHost);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await startSession(sessionHost, dateInput.value, daySel.value, days);
  });
}

async function startSession(host, date, dayId, days) {
  loading(host);
  try {
    const day = days.find((d) => d.id === dayId);

    // ¿Existe ya una sesión para esa fecha + día? La reabrimos.
    const existing = (await WorkoutSessions.list(200)).find(
      (s) => s.session_date === date && s.routine_day_id === dayId
    );
    let session = existing;
    if (!session) {
      session = await WorkoutSessions.insert({ session_date: date, routine_day_id: dayId });
    } else {
      toast("Reabriendo sesión existente de ese día");
    }

    const [planned, existingSets] = await Promise.all([
      RoutineExercises.byDay(dayId),
      WorkoutSets.bySession(session.id),
    ]);

    // Prefill: por cada ejercicio del plan, junta lo ya guardado en esta sesión
    // o, si no hay, lo de la última vez que se hizo.
    const blocks = await Promise.all(
      planned.map(async (pe) => {
        const already = existingSets.filter((s) => s.exercise_id === pe.exercise_id);
        if (already.length) return { pe, prefill: already, fromLast: false };
        const last = await WorkoutSets.lastSetsFor(pe.exercise_id, session.id);
        return { pe, prefill: last, fromLast: true };
      })
    );

    renderSession(host, session, day, blocks);
  } catch (err) {
    showError(err);
  }
}

function renderSession(host, session, day, blocks) {
  clear(host);

  const banner = el("div", { class: "session-banner" }, [
    el("div", {}, [
      el("strong", {}, day?.name || "Sesión"),
      el("span", { class: "muted" }, "  " + fmtDate(session.session_date)),
    ]),
    el("button", { class: "btn btn--ghost", on: { click: () => navigate("/history/" + session.id) } }, "Ver sesión →"),
  ]);
  host.append(banner);

  if (!blocks.length) {
    host.append(emptyState("Este día no tiene ejercicios asignados", "Añádelos en Rutina."));
    return;
  }

  blocks.forEach((b) => host.append(exerciseBlock(session, b)));

  // Nota de sesión + finalizar
  const footer = el("div", { class: "card" });
  const note = el("input", { type: "text", placeholder: "Nota de la sesión (opcional)", value: session.notes || "" });
  footer.append(el("label", { class: "field field--wide" }, [el("span", {}, "Nota de la sesión"), note]));
  footer.append(el("div", { class: "grid grid--actions" }, [
    el("button", { class: "btn", on: { click: async () => {
      try { await WorkoutSessions.update(session.id, { notes: note.value.trim() || null }); toast("Nota guardada"); }
      catch (e) { showError(e); }
    } } }, "Guardar nota"),
    el("button", { class: "btn btn--primary", on: { click: () => navigate("/history/" + session.id) } }, "Finalizar →"),
  ]));
  host.append(footer);
}

function exerciseBlock(session, { pe, prefill, fromLast }) {
  const ex = pe.exercise || {};
  const card = el("div", { class: "card exercise-block" });

  const target = [pe.target_sets ? `${pe.target_sets} series` : null, pe.target_reps].filter(Boolean).join(" × ");
  card.append(el("div", { class: "exercise-block__head" }, [
    el("h2", { class: "card__title" }, ex.name || "(ejercicio)"),
    target ? el("span", { class: "chip" }, target) : null,
  ]));
  if (prefill.length && fromLast) {
    card.append(el("div", { class: "muted small" }, "Pre-rellenado con la última vez ✎ ajusta lo que cambie"));
  }

  const rowsHost = el("div", { class: "sets" });
  card.append(el("div", { class: "sets__head" }, [
    el("span", {}, "#"), el("span", {}, "Kg"), el("span", {}, "Reps"),
    el("span", { title: "Al fallo" }, "F"), el("span", { title: "RPE" }, "RPE"), el("span", {}, ""),
  ]));
  card.append(rowsHost);

  // Cuántas filas iniciales: lo guardado/última vez, o el objetivo, o 1.
  const initialCount = prefill.length || pe.target_sets || 1;
  const state = []; // referencias a inputs por fila

  const addRow = (data = {}) => {
    const n = state.length + 1;
    const w = el("input", { type: "number", step: "any", inputmode: "decimal", value: data.weight_kg ?? "", class: "set-in" });
    const r = el("input", { type: "number", step: "1", inputmode: "numeric", value: data.reps ?? "", class: "set-in" });
    const f = el("input", { type: "checkbox" });
    if (data.is_failure) f.checked = true;
    const rpe = el("input", { type: "number", step: "0.5", min: "1", max: "10", inputmode: "decimal", value: data.rpe ?? "", class: "set-in set-in--rpe" });
    const numCell = el("span", { class: "set-num" }, String(n));
    const del = el("button", { class: "icon-btn danger", title: "Quitar serie", type: "button" }, "✕");
    const row = el("div", { class: "set-row" }, [numCell, w, r,
      el("span", { class: "set-check" }, f), rpe, del]);
    const entry = { row, numCell, w, r, f, rpe };
    del.addEventListener("click", () => {
      const idx = state.indexOf(entry);
      if (idx >= 0) state.splice(idx, 1);
      row.remove();
      state.forEach((s, i) => (s.numCell.textContent = String(i + 1)));
    });
    state.push(entry);
    rowsHost.append(row);
  };

  for (let i = 0; i < initialCount; i++) addRow(prefill[i] || {});

  const controls = el("div", { class: "exercise-block__controls" }, [
    el("button", { class: "btn btn--small", type: "button", on: { click: () => addRow({}) } }, "＋ Serie"),
    el("button", {
      class: "btn btn--primary btn--small", type: "button",
      on: { click: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          // Reunir filas con al menos peso o reps.
          const rows = state
            .map((s, i) => ({
              set_number: i + 1,
              weight_kg: s.w.value === "" ? null : Number(s.w.value),
              reps: s.r.value === "" ? null : Number(s.r.value),
              is_failure: s.f.checked,
              rpe: s.rpe.value === "" ? null : Number(s.rpe.value),
            }))
            .filter((r) => r.weight_kg != null || r.reps != null);

          // Idempotente: borra las series previas de este ejercicio en la sesión.
          const existing = await WorkoutSets.bySession(session.id);
          const toDelete = existing.filter((s) => s.exercise_id === pe.exercise_id);
          await Promise.all(toDelete.map((s) => WorkoutSets.remove(s.id)));

          if (rows.length) {
            await WorkoutSets.insertMany(rows.map((r) => ({ ...r, session_id: session.id, exercise_id: pe.exercise_id })));
          }
          toast(`${ex.name}: ${rows.length} series guardadas`);
          card.classList.add("exercise-block--saved");
        } catch (err) { showError(err); }
        finally { btn.disabled = false; }
      } },
    }, "✓ Guardar ejercicio"),
  ]);
  card.append(controls);
  return card;
}
