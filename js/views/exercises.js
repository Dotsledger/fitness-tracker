// ============================================================================
// Vista: Catálogo de ejercicios
// ============================================================================

import { Exercises } from "../db.js";
import { el, clear, loading, toast, showError, confirmAction, emptyState } from "../utils.js";
import { actionMenu, kebabButton } from "../ui.js";
import { exerciseIcon } from "../exercise-icons.js";

export async function renderExercises(root) {
  loading(root);
  const list = await Exercises.list({ includeInactive: true });
  clear(root);

  root.append(el("h1", { class: "view-title" }, "Catálogo de ejercicios"));

  // ---- Alta ---------------------------------------------------------------
  root.append(addCard(root));

  // ---- Listado ------------------------------------------------------------
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, `Ejercicios (${list.length})`));
  if (!list.length) {
    card.append(emptyState("Sin ejercicios", "Añade el primero arriba."));
    root.append(card);
    return;
  }

  // Agrupar por grupo muscular
  const groups = {};
  for (const ex of list) {
    const g = ex.muscle_group || "Sin grupo";
    (groups[g] ||= []).push(ex);
  }

  for (const g of Object.keys(groups).sort()) {
    card.append(el("h3", { class: "sub" }, g));
    for (const ex of groups[g]) {
      card.append(exerciseRow(ex, root));
    }
  }
  root.append(card);
}

function addCard(root) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Nuevo ejercicio"));
  const form = el("form", { class: "form-grid" });
  const name = el("input", { type: "text", placeholder: "Nombre *", required: true });
  const muscle = el("input", { type: "text", placeholder: "Grupo muscular (p.ej. Pecho)" });
  const equip = el("input", { type: "text", placeholder: "Equipo (p.ej. Barra)" });
  const notes = el("input", { type: "text", placeholder: "Notas" });
  form.append(
    el("label", { class: "field" }, [el("span", {}, "Nombre *"), name]),
    el("label", { class: "field" }, [el("span", {}, "Grupo muscular"), muscle]),
    el("label", { class: "field" }, [el("span", {}, "Equipo"), equip]),
    el("label", { class: "field" }, [el("span", {}, "Notas"), notes]),
    el("button", { type: "submit", class: "btn btn--primary field--wide" }, "Añadir")
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!name.value.trim()) return toast("El nombre es obligatorio", "err");
    try {
      await Exercises.insert({
        name: name.value.trim(),
        muscle_group: muscle.value.trim() || null,
        equipment: equip.value.trim() || null,
        notes: notes.value.trim() || null,
      });
      toast("Ejercicio añadido");
      renderExercises(root);
    } catch (err) { showError(err); }
  });
  card.append(form);
  return card;
}

function exerciseRow(ex, root) {
  const meta = [ex.equipment, ex.notes].filter(Boolean).join(" · ");

  const kebab = kebabButton("Opciones del ejercicio");
  kebab.addEventListener("click", () => actionMenu(kebab, [
    { icon: "✎", label: "Editar", onClick: () => editExercise(ex, root) },
    {
      icon: ex.is_active ? "⏸" : "▶",
      label: ex.is_active ? "Desactivar (ocultar sin borrar)" : "Activar",
      onClick: async () => {
        try { await Exercises.update(ex.id, { is_active: !ex.is_active }); renderExercises(root); }
        catch (err) { showError(err); }
      },
    },
    {
      icon: "🗑", label: "Eliminar", danger: true,
      onClick: async () => {
        if (!confirmAction(`¿Eliminar "${ex.name}"? Se quitará también de las rutinas. El historial de series se conserva.`)) return;
        try { await Exercises.remove(ex.id); toast("Eliminado"); renderExercises(root); }
        catch (err) { showError(err); }
      },
    },
  ], { title: ex.name }));

  return el("div", { class: "list-row" + (ex.is_active ? "" : " list-row--muted") }, [
    exerciseIcon(ex.name),
    el("div", { class: "list-row__main" }, [
      el("div", { class: "list-row__title" }, ex.name + (ex.is_active ? "" : " (inactivo)")),
      meta ? el("div", { class: "list-row__sub" }, meta) : null,
    ]),
    kebab,
  ]);
}

function editExercise(ex, root) {
  const name = prompt("Nombre", ex.name);
  if (name == null) return;
  const muscle = prompt("Grupo muscular", ex.muscle_group || "");
  if (muscle == null) return;
  const equip = prompt("Equipo", ex.equipment || "");
  if (equip == null) return;
  const notes = prompt("Notas", ex.notes || "");
  if (notes == null) return;
  Exercises.update(ex.id, {
    name: name.trim(),
    muscle_group: muscle.trim() || null,
    equipment: equip.trim() || null,
    notes: notes.trim() || null,
  }).then(() => { toast("Actualizado"); renderExercises(root); }).catch(showError);
}
