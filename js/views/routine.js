// ============================================================================
// Vista: Rutina (días + asignación de ejercicios)
// ============================================================================

import { RoutineDays, RoutineExercises, Exercises } from "../db.js";
import { el, clear, loading, toast, showError, confirmAction, emptyState } from "../utils.js";

export async function renderRoutine(root) {
  loading(root);
  const [days, catalog] = await Promise.all([
    RoutineDays.list({ includeInactive: true }),
    Exercises.list(),
  ]);
  // Cargar los ejercicios de cada día en paralelo
  const perDay = await Promise.all(days.map((d) => RoutineExercises.byDay(d.id)));

  clear(root);
  root.append(el("h1", { class: "view-title" }, "Rutina"));

  // ---- Añadir día ---------------------------------------------------------
  const addDay = el("div", { class: "card" });
  addDay.append(el("h2", { class: "card__title" }, "Añadir día de rutina"));
  const form = el("form", { class: "inline-form" });
  const nameInput = el("input", { type: "text", placeholder: "Nombre (p.ej. Push)", required: true });
  form.append(nameInput, el("button", { type: "submit", class: "btn btn--primary" }, "Añadir día"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!nameInput.value.trim()) return;
    try {
      const order = days.length ? Math.max(...days.map((d) => d.day_order || 0)) + 1 : 1;
      await RoutineDays.insert({ name: nameInput.value.trim(), day_order: order });
      toast("Día añadido");
      renderRoutine(root);
    } catch (err) { showError(err); }
  });
  addDay.append(form);
  root.append(addDay);

  if (!days.length) {
    root.append(emptyState("Aún no hay días de rutina", "Crea tu primer día arriba (Push / Pull / Legs...)."));
    return;
  }

  if (!catalog.length) {
    root.append(el("p", { class: "warn" },
      "No hay ejercicios en el catálogo. Ve a Ejercicios y crea algunos para poder asignarlos."));
  }

  // ---- Un card por día ----------------------------------------------------
  days.forEach((day, i) => {
    root.append(dayCard(day, perDay[i], days, catalog, root));
  });
}

function dayCard(day, planned, allDays, catalog, root) {
  const card = el("div", { class: "card" + (day.is_active ? "" : " card--muted") });

  // Cabecera con acciones de día
  const header = el("div", { class: "day-head" }, [
    el("h2", { class: "card__title" }, `${day.name}${day.is_active ? "" : " (inactivo)"}`),
    el("div", { class: "list-row__actions" }, [
      el("button", { class: "icon-btn", title: "Subir", on: { click: () => reorderDay(day, allDays, -1, root) } }, "▲"),
      el("button", { class: "icon-btn", title: "Bajar", on: { click: () => reorderDay(day, allDays, +1, root) } }, "▼"),
      el("button", { class: "icon-btn", title: "Renombrar", on: { click: () => renameDay(day, root) } }, "✎"),
      el("button", {
        class: "icon-btn", title: day.is_active ? "Desactivar" : "Activar",
        on: { click: async () => { try { await RoutineDays.update(day.id, { is_active: !day.is_active }); renderRoutine(root); } catch (e) { showError(e); } } },
      }, day.is_active ? "⏸" : "▶"),
      el("button", {
        class: "icon-btn danger", title: "Eliminar día",
        on: { click: async () => {
          if (!confirmAction(`¿Eliminar el día "${day.name}"? Se borran sus asignaciones (no el historial).`)) return;
          try { await RoutineDays.remove(day.id); toast("Día eliminado"); renderRoutine(root); } catch (e) { showError(e); }
        } },
      }, "🗑"),
    ]),
  ]);
  card.append(header);

  // Lista de ejercicios planificados
  if (!planned.length) {
    card.append(el("p", { class: "muted" }, "Sin ejercicios asignados."));
  } else {
    planned.forEach((pe, idx) => {
      card.append(plannedRow(pe, planned, idx, allDays, root));
    });
  }

  // Añadir ejercicio a este día
  if (catalog.length) {
    const addForm = el("form", { class: "inline-form inline-form--wrap" });
    const sel = el("select", {});
    sel.append(el("option", { value: "" }, "— Ejercicio —"));
    catalog.forEach((ex) => sel.append(el("option", { value: ex.id }, ex.name)));
    const sets = el("input", { type: "number", placeholder: "Series", min: "1", style: "width:5.5rem", inputmode: "numeric" });
    const reps = el("input", { type: "text", placeholder: "Reps (8-12)", style: "width:7rem" });
    addForm.append(sel, sets, reps, el("button", { type: "submit", class: "btn" }, "＋ Añadir"));
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!sel.value) return toast("Elige un ejercicio", "err");
      try {
        const order = planned.length ? Math.max(...planned.map((p) => p.exercise_order || 0)) + 1 : 1;
        await RoutineExercises.insert({
          routine_day_id: day.id,
          exercise_id: sel.value,
          exercise_order: order,
          target_sets: sets.value ? Number(sets.value) : null,
          target_reps: reps.value.trim() || null,
        });
        renderRoutine(root);
      } catch (err) { showError(err); }
    });
    card.append(addForm);
  }

  return card;
}

function plannedRow(pe, planned, idx, allDays, root) {
  const ex = pe.exercise || {};
  const target = [pe.target_sets ? `${pe.target_sets} series` : null, pe.target_reps].filter(Boolean).join(" × ");

  // Selector para mover a otro día
  const moveSel = el("select", { class: "move-sel", title: "Mover a otro día" });
  moveSel.append(el("option", { value: "" }, "Mover a…"));
  allDays.filter((d) => d.id !== pe.routine_day_id).forEach((d) =>
    moveSel.append(el("option", { value: d.id }, d.name)));
  moveSel.addEventListener("change", async () => {
    if (!moveSel.value) return;
    try { await RoutineExercises.update(pe.id, { routine_day_id: moveSel.value }); toast("Movido"); renderRoutine(root); }
    catch (e) { showError(e); }
  });

  return el("div", { class: "list-row" }, [
    el("div", { class: "list-row__main" }, [
      el("div", { class: "list-row__title" }, ex.name || "(ejercicio borrado)"),
      el("div", { class: "list-row__sub" }, [
        target || "sin objetivo",
        pe.target_rest_sec ? ` · ⏱ ${pe.target_rest_sec}s` : "",
        ex.muscle_group ? " · " + ex.muscle_group : "",
      ].join("")),
    ]),
    el("div", { class: "list-row__actions" }, [
      el("button", { class: "icon-btn", title: "Subir", on: { click: () => reorderPlanned(planned, idx, -1, root) } }, "▲"),
      el("button", { class: "icon-btn", title: "Bajar", on: { click: () => reorderPlanned(planned, idx, +1, root) } }, "▼"),
      el("button", { class: "icon-btn", title: "Editar objetivo", on: { click: () => editTarget(pe, root) } }, "✎"),
      moveSel,
      el("button", {
        class: "icon-btn danger", title: "Quitar del día",
        on: { click: async () => {
          try { await RoutineExercises.remove(pe.id); renderRoutine(root); } catch (e) { showError(e); }
        } },
      }, "✕"),
    ]),
  ]);
}

function editTarget(pe, root) {
  const sets = prompt("Series objetivo", pe.target_sets ?? "");
  if (sets == null) return;
  const reps = prompt("Reps objetivo (ej. 8-12, 5x5, AMRAP)", pe.target_reps ?? "");
  if (reps == null) return;
  const rest = prompt("Descanso entre series (segundos)", pe.target_rest_sec ?? "");
  if (rest == null) return;
  RoutineExercises.update(pe.id, {
    target_sets: sets.trim() === "" ? null : Number(sets),
    target_reps: reps.trim() || null,
    target_rest_sec: rest.trim() === "" ? null : Number(rest),
  }).then(() => renderRoutine(root)).catch(showError);
}

async function renameDay(day, root) {
  const name = prompt("Nuevo nombre del día", day.name);
  if (name == null || !name.trim()) return;
  try { await RoutineDays.update(day.id, { name: name.trim() }); renderRoutine(root); }
  catch (e) { showError(e); }
}

// Intercambia day_order con el vecino.
async function reorderDay(day, allDays, dir, root) {
  const sorted = [...allDays].sort((a, b) => (a.day_order || 0) - (b.day_order || 0));
  const i = sorted.findIndex((d) => d.id === day.id);
  const j = i + dir;
  if (j < 0 || j >= sorted.length) return;
  const a = sorted[i], b = sorted[j];
  try {
    await Promise.all([
      RoutineDays.update(a.id, { day_order: b.day_order }),
      RoutineDays.update(b.id, { day_order: a.day_order }),
    ]);
    renderRoutine(root);
  } catch (e) { showError(e); }
}

async function reorderPlanned(planned, idx, dir, root) {
  const j = idx + dir;
  if (j < 0 || j >= planned.length) return;
  const a = planned[idx], b = planned[j];
  try {
    await Promise.all([
      RoutineExercises.update(a.id, { exercise_order: b.exercise_order }),
      RoutineExercises.update(b.id, { exercise_order: a.exercise_order }),
    ]);
    renderRoutine(root);
  } catch (e) { showError(e); }
}
