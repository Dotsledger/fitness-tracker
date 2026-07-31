// ============================================================================
// Vista: Biblioteca de alimentos
// Catálogo editable. Cada alimento define su ración base (amount+unit) y los
// macros de ESA ración; el cuaderno de Nutrición multiplica por cantidad.
// Editar un alimento aquí actualiza automáticamente todas las comidas que lo
// usan (las comidas referencian por id, no copian los datos).
// ============================================================================

import { Foods } from "../db.js";
import { el, clear, loading, fmt, toast, showError, confirmAction, emptyState } from "../utils.js";
import { actionMenu, kebabButton } from "../ui.js";

export async function renderFoods(root) {
  loading(root);
  const list = await Foods.list({ includeInactive: true });
  clear(root);

  root.append(el("a", { class: "back-link", href: "#/nutrition" }, "← Nutrición"));
  root.append(el("h1", { class: "view-title" }, "🥫 Biblioteca de alimentos"));

  root.append(formCard(root, list));

  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, `Alimentos (${list.length})`));
  if (!list.length) {
    card.append(emptyState("Sin alimentos", "Añade el primero arriba."));
    root.append(card);
    return;
  }

  const groups = {};
  for (const f of list) {
    const g = f.cat || "Sin categoría";
    (groups[g] ||= []).push(f);
  }

  for (const g of Object.keys(groups).sort()) {
    card.append(el("h3", { class: "sub" }, g));
    for (const f of groups[g]) {
      card.append(foodRow(f, root));
    }
  }
  root.append(card);
}

// Alta y edición comparten el mismo formulario: "Editar" en un alimento
// rellena los campos y el submit pasa a actualizar en vez de insertar.
let editingFood = null;

function formCard(root, list) {
  const card = el("div", { class: "card" });
  const title = el("h2", { class: "card__title" }, editingFood ? `Editar: ${editingFood.name}` : "Nuevo alimento");
  card.append(title);

  const form = el("form", { class: "form-grid" });
  const name = el("input", { type: "text", placeholder: "Nombre *", required: true });
  const cat = el("input", { type: "text", placeholder: "🥛 Lácteos y proteína", list: "food-cats" });
  const datalist = el("datalist", { id: "food-cats" });
  [...new Set(list.map((f) => f.cat).filter(Boolean))].sort().forEach((c) =>
    datalist.append(el("option", { value: c }))
  );
  const amount = el("input", { type: "number", placeholder: "30", step: "any", min: "0", required: true, inputmode: "decimal" });
  const unit = el("select", {}, ["g", "ml", "ud"].map((u) => el("option", { value: u }, u)));
  const kcal = el("input", { type: "number", placeholder: "kcal", step: "any", min: "0", inputmode: "decimal" });
  const protein = el("input", { type: "number", placeholder: "g", step: "any", min: "0", inputmode: "decimal" });
  const carbs = el("input", { type: "number", placeholder: "g", step: "any", min: "0", inputmode: "decimal" });
  const fat = el("input", { type: "number", placeholder: "g", step: "any", min: "0", inputmode: "decimal" });

  if (editingFood) {
    name.value = editingFood.name;
    cat.value = editingFood.cat || "";
    amount.value = editingFood.amount;
    unit.value = editingFood.unit;
    kcal.value = editingFood.kcal;
    protein.value = editingFood.protein;
    carbs.value = editingFood.carbs;
    fat.value = editingFood.fat;
  }

  form.append(
    el("label", { class: "field field--wide" }, [el("span", {}, "Nombre *"), name]),
    el("label", { class: "field field--wide" }, [el("span", {}, "Categoría"), cat, datalist]),
    el("label", { class: "field" }, [el("span", {}, "Ración base *"), amount]),
    el("label", { class: "field" }, [el("span", {}, "Unidad"), unit]),
    el("label", { class: "field" }, [el("span", {}, "Kcal (por ración)"), kcal]),
    el("label", { class: "field" }, [el("span", {}, "Proteína (g)"), protein]),
    el("label", { class: "field" }, [el("span", {}, "Carbohidratos (g)"), carbs]),
    el("label", { class: "field" }, [el("span", {}, "Grasa (g)"), fat]),
  );

  const hint = el("p", { class: "muted small field--wide" },
    "Deja las kcal vacías y se calculan solas con 4·prot + 4·carbs + 9·grasa.");
  form.append(hint);

  const submitBtn = el("button", { type: "submit", class: "btn btn--primary" }, editingFood ? "Guardar cambios" : "Añadir");
  const actions = el("div", { class: "field--wide" }, [submitBtn]);
  if (editingFood) {
    const cancelBtn = el("button", { type: "button", class: "btn", style: "margin-left:8px" }, "Cancelar");
    cancelBtn.addEventListener("click", () => { editingFood = null; renderFoods(root); });
    actions.append(cancelBtn);
  }
  form.append(actions);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!name.value.trim()) return toast("El nombre es obligatorio", "err");
    if (!amount.value || Number(amount.value) <= 0) return toast("La ración base es obligatoria", "err");
    const p = Number(protein.value) || 0;
    const c = Number(carbs.value) || 0;
    const g = Number(fat.value) || 0;
    const k = kcal.value !== "" ? Number(kcal.value) : Math.round(p * 4 + c * 4 + g * 9);
    const row = {
      name: name.value.trim(),
      cat: cat.value.trim() || null,
      amount: Number(amount.value),
      unit: unit.value,
      kcal: k, protein: p, carbs: c, fat: g,
    };
    try {
      if (editingFood) {
        await Foods.update(editingFood.id, row);
        editingFood = null;
        toast("Alimento actualizado");
      } else {
        await Foods.insert(row);
        toast("Alimento añadido");
      }
      renderFoods(root);
    } catch (err) { showError(err); }
  });

  card.append(form);
  return card;
}

function foodRow(f, root) {
  const meta = `${fmt(f.amount, f.amount < 10 ? 2 : 0)} ${f.unit} · ${Math.round(f.kcal)} kcal · P ${fmt(f.protein, 1)} · C ${fmt(f.carbs, 1)} · G ${fmt(f.fat, 1)}`;

  const kebab = kebabButton("Opciones del alimento");
  kebab.addEventListener("click", () => actionMenu(kebab, [
    {
      icon: "✎", label: "Editar",
      onClick: () => { editingFood = f; renderFoods(root).then(() => window.scrollTo(0, 0)); },
    },
    {
      icon: f.is_active ? "⏸" : "▶",
      label: f.is_active ? "Desactivar (ocultar sin borrar)" : "Activar",
      onClick: async () => {
        try { await Foods.update(f.id, { is_active: !f.is_active }); renderFoods(root); }
        catch (err) { showError(err); }
      },
    },
    {
      icon: "🗑", label: "Eliminar", danger: true,
      onClick: async () => {
        if (!confirmAction(`¿Eliminar "${f.name}"? Se quitará también de las comidas donde aparezca.`)) return;
        try { await Foods.remove(f.id); toast("Eliminado"); renderFoods(root); }
        catch (err) { showError(err); }
      },
    },
  ], { title: f.name }));

  return el("div", { class: "list-row" + (f.is_active ? "" : " list-row--muted") }, [
    el("div", { class: "list-row__main" }, [
      el("div", { class: "list-row__title" }, f.name + (f.is_active ? "" : " (inactivo)")),
      el("div", { class: "list-row__sub" }, meta),
    ]),
    kebab,
  ]);
}
