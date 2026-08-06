// ============================================================================
// Vista: Programas de rutina (bloques de entrenamiento)
// Cada programa agrupa sus días de rutina; solo uno está activo a la vez.
// Duplicar copia días + ejercicios + calendario (útil para iterar un bloque).
// Fuera de la tabbar: se llega desde Rutina (patrón /exercises y /foods).
// ============================================================================

import { RoutinePrograms, RoutineDays, RoutineExercises, RoutineSchedule, WorkoutSessions } from "../db.js";
import { el, clear, loading, toast, showError, confirmAction, emptyState } from "../utils.js";
import { actionMenu, kebabButton } from "../ui.js";

export async function renderPrograms(root) {
  loading(root);
  // Los días se acotan a los programas de este perfil (RoutineDays no sabe de
  // perfiles: hereda la separación a través de program_id).
  const programs = await RoutinePrograms.list();
  const allDays = await RoutineDays.list({
    programIds: programs.map((p) => p.id),
    includeInactive: true,
  });

  clear(root);
  root.append(el("a", { class: "back-link", href: "#/routine" }, "← Rutina"));
  root.append(el("h1", { class: "view-title" }, "🗂 Programas"));

  // ---- Crear programa -------------------------------------------------------
  const addCard = el("div", { class: "card" });
  addCard.append(el("h2", { class: "card__title" }, "Nuevo programa"));
  const form = el("form", { class: "inline-form" });
  const nameInput = el("input", { type: "text", placeholder: "Nombre (p.ej. Septiembre)", required: true });
  form.append(nameInput, el("button", { type: "submit", class: "btn btn--primary" }, "Crear"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!nameInput.value.trim()) return;
    try {
      await RoutinePrograms.insert({ name: nameInput.value.trim() });
      toast("Programa creado");
      renderPrograms(root);
    } catch (err) { showError(err); }
  });
  addCard.append(form);
  root.append(addCard);

  if (!programs.length) {
    root.append(emptyState("Sin programas", "Crea el primero arriba."));
    return;
  }

  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, `Programas (${programs.length})`));
  programs.forEach((p) => {
    const days = allDays.filter((d) => d.program_id === p.id);
    card.append(programRow(p, days, root));
  });
  root.append(card);
}

// ---------------------------------------------------------------------------
function programRow(program, days, root) {
  const sub = [
    `${days.length} ${days.length === 1 ? "día" : "días"}`,
    program.is_active ? "✅ activo" : null,
  ].filter(Boolean).join(" · ");

  const kebab = kebabButton("Opciones del programa");
  kebab.addEventListener("click", () => actionMenu(kebab, [
    !program.is_active ? {
      icon: "▶", label: "Activar",
      onClick: async () => {
        try {
          await RoutinePrograms.activate(program.id);
          toast(`Programa activo: ${program.name}`);
          renderPrograms(root);
        } catch (e) { showError(e); }
      },
    } : null,
    {
      icon: "✎", label: "Renombrar",
      onClick: async () => {
        const name = prompt("Nuevo nombre del programa", program.name);
        if (name == null || !name.trim()) return;
        try { await RoutinePrograms.update(program.id, { name: name.trim() }); renderPrograms(root); }
        catch (e) { showError(e); }
      },
    },
    {
      icon: "⧉", label: "Duplicar",
      onClick: () => duplicateProgram(program, days, root),
    },
    {
      icon: "🗑", label: "Eliminar", danger: true,
      onClick: () => deleteProgram(program, days, root),
    },
  ].filter(Boolean), { title: program.name }));

  return el("div", { class: "list-row" + (program.is_active ? "" : " list-row--muted") }, [
    el("div", { class: "list-row__main" }, [
      el("div", { class: "list-row__title" }, program.name),
      el("div", { class: "list-row__sub" }, sub),
    ]),
    kebab,
  ]);
}

// ---------------------------------------------------------------------------
// Duplica un programa completo: días (con su orden), ejercicios asignados a
// cada día, y calendario semanal (remapeando cada día al clon correspondiente).
async function duplicateProgram(program, days, root) {
  try {
    const copy = await RoutinePrograms.insert({ name: `${program.name} (copia)` });

    // Clonar días y guardar el mapeo original → clon
    const idMap = new Map();
    for (const d of days) {
      const clone = await RoutineDays.insert({
        name: d.name,
        day_order: d.day_order,
        is_active: d.is_active,
        program_id: copy.id,
      });
      idMap.set(d.id, clone.id);
    }

    // Clonar ejercicios de cada día
    for (const d of days) {
      const planned = await RoutineExercises.byDay(d.id);
      for (const pe of planned) {
        await RoutineExercises.insert({
          routine_day_id: idMap.get(d.id),
          exercise_id: pe.exercise_id,
          exercise_order: pe.exercise_order,
          target_sets: pe.target_sets,
          target_reps: pe.target_reps,
          target_rest_sec: pe.target_rest_sec,
          notes: pe.notes,
        });
      }
    }

    // Clonar calendario semanal
    const schedule = await RoutineSchedule.byProgram(program.id);
    for (const s of schedule) {
      await RoutineSchedule.insert({
        program_id: copy.id,
        weekday: s.weekday,
        routine_day_id: s.routine_day_id ? idMap.get(s.routine_day_id) ?? null : null,
        note: s.note,
      });
    }

    toast(`Duplicado como "${copy.name}"`);
    renderPrograms(root);
  } catch (e) { showError(e); }
}

// ---------------------------------------------------------------------------
// Borrar un programa arrastra sus días en cascada, y las sesiones registradas
// referencian esos días — así que solo se permite si no hay historial.
async function deleteProgram(program, days, root) {
  try {
    const hasHistory = await WorkoutSessions.hasAnyForDays(days.map((d) => d.id));
    if (hasHistory) {
      toast("Tiene entrenos registrados: se conserva como archivado (no lo actives y ya)", "err");
      return;
    }
    if (!confirmAction(`¿Eliminar el programa "${program.name}"? Se borran sus ${days.length} días, ejercicios asignados y calendario.`)) return;
    await RoutinePrograms.remove(program.id);
    toast("Programa eliminado");
    renderPrograms(root);
  } catch (e) { showError(e); }
}
