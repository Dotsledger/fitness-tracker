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

// ============================================================================
// Temporizador de descanso · barra flotante con cuenta atrás, +/- 15s,
// vibración y pitido al llegar a cero. Único a la vez.
// ============================================================================
const RestTimer = (() => {
  let bar, label, time, interval, remaining = 0;

  function build() {
    time = el("span", { class: "rest__time" }, "0:00");
    label = el("span", { class: "rest__label" }, "");
    bar = el("div", { class: "rest-timer", role: "timer" }, [
      el("button", { class: "rest__btn", title: "-15s", on: { click: () => adjust(-15) } }, "−15"),
      el("div", { class: "rest__mid" }, [time, label]),
      el("button", { class: "rest__btn", title: "+15s", on: { click: () => adjust(15) } }, "+15"),
      el("button", { class: "rest__btn rest__btn--close", title: "Saltar", on: { click: stop } }, "✕"),
    ]);
    document.body.append(bar);
  }

  function fmt(s) {
    const m = Math.floor(s / 60);
    const ss = String(Math.max(0, s % 60)).padStart(2, "0");
    return `${m}:${ss}`;
  }

  function tick() {
    remaining -= 1;
    time.textContent = fmt(remaining);
    if (remaining <= 0) done();
  }

  function done() {
    clearInterval(interval);
    interval = null;
    time.textContent = "¡Ya!";
    bar.classList.add("rest-timer--done");
    try { navigator.vibrate?.([200, 100, 200]); } catch {}
    beep();
    setTimeout(stop, 2500);
  }

  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
      osc.onended = () => ctx.close();
    } catch {}
  }

  function adjust(delta) {
    remaining = Math.max(1, remaining + delta);
    time.textContent = fmt(remaining);
    if (!interval) { bar.classList.remove("rest-timer--done"); interval = setInterval(tick, 1000); }
  }

  function start(seconds, name = "") {
    if (!bar) build();
    clearInterval(interval);
    remaining = seconds;
    label.textContent = name ? "descanso · " + name : "descanso";
    time.textContent = fmt(remaining);
    bar.classList.remove("rest-timer--done");
    bar.classList.add("rest-timer--show");
    interval = setInterval(tick, 1000);
  }

  function stop() {
    clearInterval(interval);
    interval = null;
    bar?.classList.remove("rest-timer--show", "rest-timer--done");
  }

  return { start, stop };
})();

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

    // Por cada ejercicio del plan: historial agrupado (para mostrar marcas) +
    // prefill (lo ya guardado en esta sesión, o la última vez que se hizo).
    const blocks = await Promise.all(
      planned.map(async (pe) => {
        const history = await WorkoutSets.historyGrouped(pe.exercise_id, session.id, 5);
        const already = existingSets.filter((s) => s.exercise_id === pe.exercise_id);
        if (already.length) return { pe, prefill: already, fromLast: false, history };
        const prefill = history.length ? history[0].sets : [];
        return { pe, prefill, fromLast: true, history };
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

// Formatea las series de una sesión: "40×10 · 40×9 · 37.5×8" (f = al fallo).
function fmtSetLine(sets) {
  return sets
    .map((s) => {
      const w = s.weight_kg != null ? s.weight_kg : "–";
      const r = s.reps != null ? s.reps : "–";
      return `${w}×${r}${s.is_failure ? "f" : ""}`;
    })
    .join("  ·  ");
}

// El mejor set de una sesión (mayor peso; a igualdad, más reps).
function bestSet(sets) {
  return sets.reduce((best, s) => {
    if (s.weight_kg == null) return best;
    if (!best) return s;
    if (Number(s.weight_kg) > Number(best.weight_kg)) return s;
    if (Number(s.weight_kg) === Number(best.weight_kg) && (s.reps || 0) > (best.reps || 0)) return s;
    return best;
  }, null);
}

function historyBox(history) {
  const box = el("details", { class: "hist", open: history.length <= 2 });
  const best = history.map((h) => bestSet(h.sets)).filter(Boolean)
    .reduce((b, s) => (!b || Number(s.weight_kg) > Number(b.weight_kg) ? s : b), null);
  box.append(el("summary", { class: "hist__summary" },
    best
      ? `Marcas anteriores · mejor ${best.weight_kg}×${best.reps}`
      : "Marcas anteriores"));
  history.forEach((h) => {
    box.append(el("div", { class: "hist__row" }, [
      el("span", { class: "hist__date" }, fmtDate(h.date)),
      el("span", { class: "hist__sets" }, fmtSetLine(h.sets)),
    ]));
  });
  return box;
}

function exerciseBlock(session, { pe, prefill, fromLast, history = [] }) {
  const ex = pe.exercise || {};
  const card = el("div", { class: "card exercise-block" });

  const restSec = pe.target_rest_sec || 90;
  const target = [pe.target_sets ? `${pe.target_sets} series` : null, pe.target_reps].filter(Boolean).join(" × ");
  card.append(el("div", { class: "exercise-block__head" }, [
    el("h2", { class: "card__title" }, ex.name || "(ejercicio)"),
    target ? el("span", { class: "chip" }, target) : null,
    el("span", { class: "chip chip--rest" }, `⏱ ${restSec}s`),
  ]));
  if (pe.notes) card.append(el("div", { class: "note-line" }, pe.notes));
  if (prefill.length && fromLast) {
    card.append(el("div", { class: "muted small" }, "Pre-rellenado con la última vez ✎ supera tus marcas"));
  }

  // Histórico de marcas del ejercicio
  if (history.length) card.append(historyBox(history));

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
    el("button", { class: "btn btn--small btn--rest", type: "button",
      on: { click: () => RestTimer.start(restSec, ex.name) } }, `⏱ Descanso ${restSec}s`),
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
