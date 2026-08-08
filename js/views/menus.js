// ============================================================================
// Vista: Menús de dieta (variantes guardadas del cuaderno nutricional)
// Varios menús por perfil, uno activo; duplicar permite basar un menú en otro
// (ej. "Comida fuera" a partir de "Estándar") sin tocar el original.
// Fuera de la tabbar: se llega desde Nutrición (patrón /foods y /programs).
// ============================================================================

import { Menus, MealSlots, MealItems, DEFAULT_SLOTS } from "../db.js";
import { el, clear, loading, toast, showError, confirmAction, emptyState } from "../utils.js";
import { actionMenu, kebabButton } from "../ui.js";

export async function renderMenus(root) {
  loading(root);
  const menus = await Menus.list();

  clear(root);
  root.append(el("a", { class: "back-link", href: "#/nutrition" }, "← Nutrición"));
  root.append(el("h1", { class: "view-title" }, "📒 Menús"));

  // ---- Crear menú -----------------------------------------------------------
  const addCard = el("div", { class: "card" });
  addCard.append(el("h2", { class: "card__title" }, "Nuevo menú"));
  addCard.append(el("p", { class: "muted small" },
    "Nace con las 4 comidas vacías. Para partir de uno existente, usa Duplicar en su menú ⋯."));
  const form = el("form", { class: "inline-form" });
  const nameInput = el("input", { type: "text", placeholder: "Nombre (p.ej. Comida fuera)", required: true });
  form.append(nameInput, el("button", { type: "submit", class: "btn btn--primary" }, "Crear"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!nameInput.value.trim()) return;
    try {
      const menu = await Menus.insert({ name: nameInput.value.trim() });
      await MealSlots.insertMany(DEFAULT_SLOTS.map((s) => ({ ...s, menu_id: menu.id })));
      toast("Menú creado");
      renderMenus(root);
    } catch (err) { showError(err); }
  });
  addCard.append(form);
  root.append(addCard);

  if (!menus.length) {
    root.append(emptyState("Sin menús", "Crea el primero arriba."));
    return;
  }

  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, `Menús (${menus.length})`));
  for (const m of menus) {
    const slots = await MealSlots.list(m.id);
    card.append(menuRow(m, slots, root));
  }
  root.append(card);
}

// ---------------------------------------------------------------------------
function menuRow(menu, slots, root) {
  const sub = [
    `${slots.length} ${slots.length === 1 ? "comida" : "comidas"}`,
    menu.is_active ? "✅ activo" : null,
  ].filter(Boolean).join(" · ");

  const kebab = kebabButton("Opciones del menú");
  kebab.addEventListener("click", () => actionMenu(kebab, [
    !menu.is_active ? {
      icon: "▶", label: "Activar",
      onClick: async () => {
        try {
          await Menus.activate(menu.id);
          toast(`Menú activo: ${menu.name}`);
          renderMenus(root);
        } catch (e) { showError(e); }
      },
    } : null,
    {
      icon: "✎", label: "Renombrar",
      onClick: async () => {
        const name = prompt("Nuevo nombre del menú", menu.name);
        if (name == null || !name.trim()) return;
        try { await Menus.update(menu.id, { name: name.trim() }); renderMenus(root); }
        catch (e) { showError(e); }
      },
    },
    {
      icon: "⧉", label: "Duplicar",
      onClick: () => duplicateMenu(menu, slots, root),
    },
    {
      icon: "🗑", label: "Eliminar", danger: true,
      onClick: async () => {
        if (menu.is_active) {
          toast("Es el menú activo: activa otro antes de eliminarlo", "err");
          return;
        }
        if (!confirmAction(`¿Eliminar el menú "${menu.name}"? Se borran sus comidas y alimentos asignados.`)) return;
        try { await Menus.remove(menu.id); toast("Menú eliminado"); renderMenus(root); }
        catch (e) { showError(e); }
      },
    },
  ].filter(Boolean), { title: menu.name }));

  return el("div", { class: "list-row" + (menu.is_active ? "" : " list-row--muted") }, [
    el("div", { class: "list-row__main" }, [
      el("div", { class: "list-row__title" }, menu.name),
      el("div", { class: "list-row__sub" }, sub),
    ]),
    kebab,
  ]);
}

// ---------------------------------------------------------------------------
// Duplica un menú completo: comidas (con su orden) y alimentos de cada comida,
// remapeando cada alimento a la comida clonada correspondiente.
async function duplicateMenu(menu, slots, root) {
  try {
    const copy = await Menus.insert({ name: `${menu.name} (copia)` });

    const idMap = new Map();
    for (const s of slots) {
      const [clone] = await MealSlots.insertMany([{
        menu_id: copy.id,
        slot_order: s.slot_order,
        name: s.name,
        optional: s.optional,
      }]);
      idMap.set(s.id, clone.id);
    }

    const items = await MealItems.list(slots.map((s) => s.id));
    for (const it of items) {
      await MealItems.insert({
        meal_slot_id: idMap.get(it.meal_slot_id),
        food_id: it.food_id,
        qty: it.qty,
        item_order: it.item_order,
      });
    }

    toast(`Duplicado como "${copy.name}"`);
    renderMenus(root);
  } catch (e) { showError(e); }
}
