// ============================================================================
// Vista: Rutina (calendario semanal + días del programa activo)
// Los días pertenecen a programas (routine_programs); aquí solo se ve el
// programa activo. El calendario asigna fuerza+cardio a cada día de la semana.
// Reordenar: arrastrando el tirador (⋮⋮). Acciones: menú ⋯ por fila/día.
// ============================================================================

import { RoutineDays, RoutineExercises, RoutinePrograms, RoutineSchedule, Exercises } from "../db.js";
import { el, clear, loading, toast, showError, confirmAction, emptyState, today, weekdayIndex, WEEKDAYS } from "../utils.js";
import { actionMenu, dragHandle, kebabButton } from "../ui.js";
import { makeSortable } from "../dnd.js";
import { exerciseIcon } from "../exercise-icons.js";
import { icon } from "../icons.js";

export async function renderRoutine(root) {
  loading(root);
  const program = await RoutinePrograms.active();

  if (!program) {
    clear(root);
    root.append(el("h1", { class: "view-title" }, "Rutina"));
    root.append(emptyState("No hay ningún programa activo", "Crea o activa uno en Programas."));
    root.append(el("a", { class: "btn btn--primary", href: "#/programs" }, [icon("folder", 18), "Programas"]));
    return;
  }

  const [days, schedule, catalog] = await Promise.all([
    RoutineDays.list({ programId: program.id, includeInactive: true }),
    RoutineSchedule.byProgram(program.id),
    Exercises.list(),
  ]);
  const perDay = await Promise.all(days.map((d) => RoutineExercises.byDay(d.id)));

  clear(root);
  root.append(el("h1", { class: "view-title" }, "Rutina"));

  // ---- Calendario semanal del programa activo -------------------------------
  root.append(weekCard(program, schedule, days, root));

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
      await RoutineDays.insert({ name: nameInput.value.trim(), day_order: order, program_id: program.id });
      toast("Día añadido");
      renderRoutine(root);
    } catch (err) { showError(err); }
  });
  addDay.append(form);
  root.append(addDay);

  if (!days.length) {
    root.append(emptyState("Este programa aún no tiene días", "Crea el primero arriba (Push / Pull / Legs...)."));
    root.append(el("a", { class: "btn btn--ghost field--wide", href: "#/programs" }, [icon("folder", 18), "Programas"]));
    return;
  }

  if (!catalog.length) {
    root.append(el("p", { class: "warn" },
      "No hay ejercicios en el catálogo. Ve a Ejercicios y crea algunos para poder asignarlos."));
  }

  // ---- Días (arrastrables por su tirador) ----------------------------------
  const daysHost = el("div", { class: "days-host" });
  days.forEach((day, i) => daysHost.append(dayCard(day, perDay[i], days, catalog, root)));
  root.append(daysHost);

  // Accesos secundarios (fuera de la barra inferior)
  root.append(el("div", { class: "grid grid--actions" }, [
    el("a", { class: "btn btn--ghost", href: "#/programs" }, [icon("folder", 18), "Programas"]),
    el("a", { class: "btn btn--ghost", href: "#/exercises" }, [icon("list", 18), "Catálogo de ejercicios"]),
  ]));
  makeSortable(daysHost, {
    handle: ".drag-day",
    onReorder: async (cards) => {
      try {
        await Promise.all(cards.map((c, i) => RoutineDays.update(c.dataset.dayId, { day_order: i + 1 })));
      } catch (e) { showError(e); renderRoutine(root); }
    },
  });
}

// ---------------------------------------------------------------------------
// Calendario semanal: 7 filas (lunes-domingo) con la fuerza asignada y la nota
// de cardio. Tocar una fila abre el menú para cambiar la fuerza o la nota.
function weekCard(program, schedule, days, root) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, [icon("calendar", 18), `Semana · ${program.name}`]));

  const todayIdx = weekdayIndex(today());
  const bySlot = new Map(schedule.map((s) => [s.weekday, s]));

  for (let wd = 0; wd < 7; wd++) {
    const slot = bySlot.get(wd) || null;
    const strength = slot?.day?.name || null;
    const isToday = wd === todayIdx;

    const row = el("div", {
      class: "list-row list-row--tap week-row"
        + (strength ? "" : " week-row--rest")
        + (isToday ? " week-row--today" : ""),
      role: "button", tabindex: "0",
    }, [
      el("div", { class: "week-row__day" }, [
        WEEKDAYS[wd],
        isToday ? el("span", { class: "week-row__today" }, "Hoy") : null,
      ]),
      el("div", { class: "list-row__main" }, [
        el("div", { class: "list-row__title" }, strength || "Descanso"),
        slot?.note ? el("div", { class: "list-row__sub" }, slot.note) : null,
      ]),
      el("span", { class: "chevron" }, icon("chevron-right", 18)),
    ]);

    row.addEventListener("click", () => actionMenu(row, [
      ...days.map((d) => ({
        icon: "dumbbell", label: d.name,
        onClick: async () => {
          try { await RoutineSchedule.set(program.id, wd, { routine_day_id: d.id, note: slot?.note ?? null }); renderRoutine(root); }
          catch (e) { showError(e); }
        },
      })),
      {
        icon: "moon", label: "Sin fuerza (descanso)",
        onClick: async () => {
          try { await RoutineSchedule.set(program.id, wd, { routine_day_id: null, note: slot?.note ?? null }); renderRoutine(root); }
          catch (e) { showError(e); }
        },
      },
      {
        icon: "pencil", label: "Nota de cardio…",
        onClick: async () => {
          const note = prompt("Nota del día (cardio, descanso...)", slot?.note ?? "");
          if (note == null) return;
          try { await RoutineSchedule.set(program.id, wd, { routine_day_id: slot?.routine_day_id ?? null, note: note.trim() || null }); renderRoutine(root); }
          catch (e) { showError(e); }
        },
      },
    ], { title: WEEKDAYS[wd] }));

    card.append(row);
  }

  return card;
}

// ---------------------------------------------------------------------------
function dayCard(day, planned, allDays, catalog, root) {
  const card = el("div", {
    class: "card day-card" + (day.is_active ? "" : " card--muted"),
    dataset: { dayId: day.id },
  });

  const kebab = kebabButton("Opciones del día");
  kebab.addEventListener("click", () => actionMenu(kebab, [
    { icon: "pencil", label: "Renombrar", onClick: () => renameDay(day, root) },
    {
      icon: day.is_active ? "pause" : "play",
      label: day.is_active ? "Desactivar" : "Activar",
      onClick: async () => {
        try { await RoutineDays.update(day.id, { is_active: !day.is_active }); renderRoutine(root); }
        catch (e) { showError(e); }
      },
    },
    {
      icon: "trash", label: "Eliminar día", danger: true,
      onClick: async () => {
        if (!confirmAction(`¿Eliminar el día "${day.name}"? Se borran sus asignaciones (no el historial).`)) return;
        try { await RoutineDays.remove(day.id); toast("Día eliminado"); renderRoutine(root); }
        catch (e) { showError(e); }
      },
    },
  ], { title: day.name }));

  card.append(el("div", { class: "day-head" }, [
    dragHandle("drag-day"),
    el("h2", { class: "card__title day-head__title" }, `${day.name}${day.is_active ? "" : " (inactivo)"}`),
    kebab,
  ]));

  const rowsHost = el("div", { class: "rows-host" });
  if (!planned.length) {
    rowsHost.append(el("p", { class: "muted" }, "Sin ejercicios asignados."));
  } else {
    planned.forEach((pe) => rowsHost.append(plannedRow(pe, allDays, root)));
  }
  card.append(rowsHost);

  if (planned.length > 1) {
    makeSortable(rowsHost, {
      handle: ".drag-ex",
      onReorder: async (rows) => {
        try {
          await Promise.all(rows.map((r, i) => RoutineExercises.update(r.dataset.reId, { exercise_order: i + 1 })));
        } catch (e) { showError(e); renderRoutine(root); }
      },
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

// ---------------------------------------------------------------------------
function plannedRow(pe, allDays, root) {
  const ex = pe.exercise || {};
  const target = [pe.target_sets ? `${pe.target_sets} series` : null, pe.target_reps].filter(Boolean).join(" × ");
  const sub = [
    target || "sin objetivo",
    pe.target_rest_sec ? `${pe.target_rest_sec}s descanso` : null,
    ex.muscle_group || null,
  ].filter(Boolean).join(" · ");

  const kebab = kebabButton("Opciones del ejercicio");
  kebab.addEventListener("click", () => actionMenu(kebab, [
    { icon: "pencil", label: "Editar objetivo", onClick: () => editTarget(pe, root) },
    {
      icon: "arrow-right", label: "Mover a…",
      children: allDays.filter((d) => d.id !== pe.routine_day_id).map((d) => ({
        label: d.name,
        onClick: async () => {
          try { await RoutineExercises.update(pe.id, { routine_day_id: d.id }); toast("Movido a " + d.name); renderRoutine(root); }
          catch (e) { showError(e); }
        },
      })),
    },
    {
      icon: "x", label: "Quitar del día", danger: true,
      onClick: async () => {
        try { await RoutineExercises.remove(pe.id); renderRoutine(root); } catch (e) { showError(e); }
      },
    },
  ], { title: ex.name || "Ejercicio" }));

  return el("div", { class: "list-row", dataset: { reId: pe.id } }, [
    dragHandle("drag-ex"),
    exerciseIcon(ex.name),
    el("div", { class: "list-row__main" }, [
      el("div", { class: "list-row__title" }, ex.name || "(ejercicio borrado)"),
      el("div", { class: "list-row__sub" }, sub),
      pe.notes ? el("div", { class: "list-row__sub note-line" }, pe.notes) : null,
    ]),
    kebab,
  ]);
}

// ---------------------------------------------------------------------------
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
