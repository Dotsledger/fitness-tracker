// ============================================================================
// Vista: Nutrición (macros objetivo, plan de dieta, lista de compra, perfil)
// Las mediciones corporales, histórico y gráficas están en la vista "Cuerpo".
// ============================================================================

import { Profile, BodyMetrics, DietGuidelines, MealPlan, ShoppingList } from "../db.js";
import { computeMacros } from "../macros.js";
import { LABELS } from "../config.js";
import {
  el, clear, loading, fmt, fmtDate, toast, showError, confirmAction,
} from "../utils.js";
import { CHART_COLORS } from "../charts.js";

export async function renderNutrition(root) {
  loading(root);
  const [profile, metrics, guidelines, meals, shopping] = await Promise.all([
    Profile.get(),
    BodyMetrics.latest().then((m) => (m ? [m] : [])).catch(() => []),
    DietGuidelines.list().catch(() => []),
    MealPlan.list().catch(() => []),
    ShoppingList.list().catch(() => []),
  ]);
  const latest = metrics.length ? metrics[0] : null;
  const macros = computeMacros(profile, latest);

  clear(root);
  root.append(el("h1", { class: "view-title" }, "Nutrición"));

  // ---- Macros calculados ---------------------------------------------------
  root.append(macrosCard(macros));

  // ---- Plan de dieta semanal -----------------------------------------------
  if (guidelines.length || meals.length) {
    root.append(dietPlanCard(guidelines, meals));
  }

  // ---- Lista de la compra (siempre visible; vacía tiene su propio mensaje) --
  root.append(shoppingCard(shopping));

  // ---- Perfil / diales -----------------------------------------------------
  root.append(profileCard(profile, root));
}

// ---------------------------------------------------------------------------
function macrosCard(macros) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Macros objetivo (hoy)"));
  if (!macros || macros.targetCalories == null) {
    card.append(el("p", { class: "muted" },
      "Faltan datos para calcular. Necesitas una medición con % de grasa y el perfil completo."));
    if (macros?.warnings?.length) {
      macros.warnings.forEach((w) => card.append(el("p", { class: "warn" }, "⚠ " + w)));
    }
    return card;
  }

  const kcal = el("div", { class: "kcal-big" }, [
    el("span", { class: "kcal-big__num" }, fmt(macros.targetCalories, 0)),
    el("span", { class: "kcal-big__unit" }, "kcal/día"),
    el("span", { class: "chip" }, macros.calorieSource === "manual" ? "override manual" : "calculado"),
  ]);
  card.append(kcal);

  const detail = el("div", { class: "kcal-detail muted" },
    `BMR ${fmt(macros.bmr, 0)} · TDEE ${fmt(macros.tdee, 0)} · masa magra ${fmt(macros.leanMass)} kg · ×${macros.activityMultiplier}`);
  card.append(detail);

  const macroGrid = el("div", { class: "grid grid--macros" });
  macroGrid.append(macroTile("Proteína", macros.protein, CHART_COLORS.muscle));
  macroGrid.append(macroTile("Carbohidratos", macros.carbs, CHART_COLORS.reps));
  macroGrid.append(macroTile("Grasa", macros.fat, CHART_COLORS.fat));
  card.append(macroGrid);

  if (macros.warnings?.length) {
    macros.warnings.forEach((w) => card.append(el("p", { class: "warn" }, "⚠ " + w)));
  }
  return card;
}

function macroTile(name, m, color) {
  return el("div", { class: "macro-tile", style: `--c:${color}` }, [
    el("div", { class: "macro-tile__name" }, name),
    el("div", { class: "macro-tile__g" }, `${fmt(m.g, 0)} g`),
    el("div", { class: "macro-tile__pct" }, m.pct != null ? `${fmt(m.pct, 0)}% · ${fmt(m.kcal, 0)} kcal` : "—"),
  ]);
}

// ---------------------------------------------------------------------------
// Escalado de recetas por nº de personas. Las cantidades escalables van entre
// {llaves} en el texto (tiempos y temperaturas quedan fuera y no se tocan).
const SERV_KEY = "ft_recipe_servings";

function getServings() {
  const n = Number(localStorage.getItem(SERV_KEY));
  return [1, 2, 3, 4].includes(n) ? n : 1;
}

function fmtQty(v) {
  const r = Math.round(v * 4) / 4; // al cuarto más cercano
  const whole = Math.floor(r + 1e-6);
  const frac = r - whole;
  const F = [[0.25, "¼"], [0.5, "½"], [0.75, "¾"]];
  const hit = F.find(([k]) => Math.abs(frac - k) < 0.01);
  if (hit) return (whole || "") + hit[1];
  return String(Math.round(r * 100) / 100).replace(".", ",");
}

function scaleToken(tok, n) {
  return tok.replace(/(\d+(?:[.,]\d+)?)|([½¼¾])/g, (m) => {
    const v = m === "½" ? 0.5 : m === "¼" ? 0.25 : m === "¾" ? 0.75 : parseFloat(m.replace(",", "."));
    const scaled = v * n;
    return scaled >= 10 ? String(Math.round(scaled)) : fmtQty(scaled);
  });
}

function scaleRecipe(text, n) {
  return text.replace(/\{([^}]*)\}/g, (_, tok) => (n === 1 ? tok : scaleToken(tok, n)));
}

function recipeBox(raw, ingredients, refs) {
  const det = el("details", { class: "recipe" });
  det.append(el("summary", { class: "recipe__summary" }, "👨‍🍳 Ver receta"));

  const scalable = raw.includes("{");
  const btns = [];
  if (scalable || ingredients?.length) {
    const chips = el("div", { class: "recipe__servings" }, [
      el("span", { class: "muted small" }, "Cocinar para"),
    ]);
    for (const n of [1, 2, 3, 4]) {
      const b = el("button", { class: "serv-chip", type: "button" }, String(n));
      b.addEventListener("click", () => {
        localStorage.setItem(SERV_KEY, String(n));
        applyServings(refs);
      });
      btns.push({ n, b });
      chips.append(b);
    }
    chips.append(el("span", { class: "muted small" }, "personas"));

    if (ingredients?.length) {
      const addBtn = el("button", { class: "add-shop-btn", type: "button" }, "🛒 Añadir a la compra");
      addBtn.addEventListener("click", async () => {
        addBtn.disabled = true;
        const prev = addBtn.textContent;
        addBtn.textContent = "Añadiendo…";
        try {
          const n = getServings();
          await addIngredientsToShopping(ingredients, n);
          toast(`Ingredientes añadidos a la compra (${n} ${n === 1 ? "persona" : "personas"})`);
          refreshShoppingCard();
          addBtn.textContent = "✓ Añadido";
          setTimeout(() => { addBtn.textContent = prev; addBtn.disabled = false; }, 1800);
        } catch (e) {
          showError(e);
          addBtn.textContent = prev;
          addBtn.disabled = false;
        }
      });
      chips.append(addBtn);
    }
    det.append(chips);
  }

  const body = el("div", { class: "recipe__body" });
  det.append(body);
  if (scalable) {
    det.append(el("div", { class: "recipe__hint" },
      "Tu ración (la del menú) no cambia: esto escala lo que cocinas. Si el horno o la airfryer van muy llenos, mejor en 2 tandas; los tiempos apenas cambian."));
  }
  refs.push({ raw, body, btns });
  return det;
}

// Aplica el nº de personas guardado a todas las recetas de la página.
function applyServings(refs) {
  const n = getServings();
  for (const r of refs) {
    r.body.textContent = scaleRecipe(r.raw, n);
    r.btns.forEach(({ n: bn, b }) => b.classList.toggle("serv-chip--on", bn === n));
  }
}

// ---------------------------------------------------------------------------
const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function dietPlanCard(guidelines, meals) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "🍽 Plan de dieta semanal"));

  // Pautas (agua, creatina, reglas)
  for (const g of guidelines) {
    card.append(el("div", { class: "diet-guide" }, [
      el("div", { class: "diet-guide__title" }, g.title),
      el("div", { class: "diet-guide__body" }, g.content),
    ]));
  }

  // Menú por días (el de hoy, abierto)
  const byDay = new Map();
  for (const m of meals) {
    if (!byDay.has(m.day_of_week)) byDay.set(m.day_of_week, []);
    byDay.get(m.day_of_week).push(m);
  }
  const todayDow = ((new Date().getDay() + 6) % 7) + 1; // 1=lunes
  const recipeRefs = []; // recetas de la página, para escalarlas todas a la vez

  for (const [dow, items] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const box = el("details", { class: "menu-day", open: dow === todayDow });
    box.append(el("summary", { class: "menu-day__summary" },
      DAY_NAMES[dow - 1] + (dow === todayDow ? "  ·  HOY" : "")));
    for (const m of items) {
      box.append(el("div", { class: "menu-day__slot" }, [
        el("div", { class: "menu-day__slotname" }, m.slot),
        el("div", { class: "menu-day__menu" }, m.menu),
        m.notes ? el("div", { class: "menu-day__notes" }, m.notes) : null,
        m.recipe ? recipeBox(m.recipe, m.ingredients, recipeRefs) : null,
      ]));
    }
    card.append(box);
  }
  applyServings(recipeRefs);
  return card;
}

// ---------------------------------------------------------------------------
// Lista de la compra. Empieza vacía: se llena desde las recetas (botón 🛒),
// sumando cantidades según el nº de personas elegido. Los tildes van en
// localStorage; "Vaciar" borra la lista para empezar otra semana.
const SHOP_KEY = "ft_shopping_checked";
const CAT_ORDER = {
  "🐟 Pescado y marisco": 10,
  "🍗 Carne y huevos": 30,
  "🥛 Lácteos y proteína": 40,
  "🌾 Cereales y carbohidratos": 50,
  "🥦 Fruta y verdura": 60,
  "🧴 Suplementos y despensa": 80,
};

function loadChecked() {
  try { return new Set(JSON.parse(localStorage.getItem(SHOP_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveChecked(set) {
  localStorage.setItem(SHOP_KEY, JSON.stringify([...set]));
}

// Unidades con plural natural ("2 bolsas", "1 bolsa").
function fmtUnit(amount, unit) {
  if (!unit || unit === "ud" || unit === "g" || unit === "ml") return unit || "";
  return amount > 1 ? unit + "s" : unit;
}
function fmtShopQty(row) {
  if (row.amount == null) return row.qty || "";
  const a = Number(row.amount);
  const n = a >= 10 ? String(Math.round(a)) : fmtQty(a);
  return `${n} ${fmtUnit(a, row.unit)}`.trim();
}

let shopCardRef = null; // referencia viva para refrescar tras añadir desde recetas

function shoppingCard(items) {
  const card = el("div", { class: "card" });
  shopCardRef = card;
  fillShoppingCard(card, items);
  return card;
}

async function refreshShoppingCard() {
  if (!shopCardRef || !document.body.contains(shopCardRef)) return;
  try { fillShoppingCard(shopCardRef, await ShoppingList.list()); }
  catch (e) { console.warn(e); }
}

function fillShoppingCard(card, items) {
  clear(card);
  const checked = loadChecked();

  card.append(el("div", { class: "shop-head" }, [
    el("h2", { class: "card__title" }, "🛒 Lista de la compra"),
    items.length ? el("button", { class: "btn btn--small btn--ghost", on: { click: async () => {
      if (!confirmAction("¿Vaciar toda la lista de la compra?")) return;
      try {
        await ShoppingList.clear();
        saveChecked(new Set());
        refreshShoppingCard();
      } catch (e) { showError(e); }
    } } }, "Vaciar") : null,
  ]));

  if (!items.length) {
    card.append(el("p", { class: "muted" },
      "Lista vacía. Ábrela desde las recetas del plan: elige personas y pulsa «🛒 Añadir a la compra»."));
    return;
  }

  card.append(el("p", { class: "muted small" }, "Marca lo que vayas cogiendo. Añade más desde las recetas."));

  const groups = new Map();
  for (const it of items) {
    if (!groups.has(it.category)) groups.set(it.category, []);
    groups.get(it.category).push(it);
  }

  for (const [cat, list] of groups) {
    card.append(el("h3", { class: "sub" }, cat));
    for (const it of list) {
      const box = el("input", { type: "checkbox" });
      if (checked.has(it.id)) box.checked = true;
      const row = el("label", { class: "shop-item" + (box.checked ? " shop-item--done" : "") }, [
        box,
        el("span", { class: "shop-item__name" }, it.item),
        el("span", { class: "shop-item__qty" }, fmtShopQty(it)),
      ]);
      box.addEventListener("change", () => {
        if (box.checked) checked.add(it.id); else checked.delete(it.id);
        saveChecked(checked);
        row.classList.toggle("shop-item--done", box.checked);
      });
      card.append(row);
    }
  }
}

// Añade los ingredientes de una receta (por ración × n personas), sumando
// sobre lo que ya haya en la lista.
async function addIngredientsToShopping(ingredients, n) {
  const list = await ShoppingList.list();
  for (const ing of ingredients) {
    const add = Number(ing.amount) * n;
    const ex = list.find(
      (r) => r.item.toLowerCase() === ing.item.toLowerCase() && (r.unit || "") === (ing.unit || "") && r.amount != null
    );
    if (ex) {
      await ShoppingList.update(ex.id, { amount: Number(ex.amount) + add });
    } else {
      await ShoppingList.insert({
        category: ing.cat,
        item: ing.item,
        amount: add,
        unit: ing.unit || null,
        item_order: CAT_ORDER[ing.cat] || 90,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Solo los "diales" que controlan el cálculo de macros. Los datos personales
// (sexo, nacimiento, altura, actividad) viven en la vista Cuerpo.
function profileCard(profile, root) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Diales de nutrición"));

  if (!profile) {
    card.append(el("p", { class: "warn" }, "No hay fila de perfil. Ejecuta db/schema.sql (crea una por defecto)."));
    return card;
  }

  card.append(el("p", { class: "muted small" },
    "Controlan el cálculo de macros. Se ajustan según tu progreso — normalmente los toco yo (Claude)."));

  const form = el("form", { class: "form-grid" });
  const inputs = {};

  const select = (name, label, options, value) => {
    const sel = el("select", { name });
    for (const [val, txt] of Object.entries(options)) {
      sel.append(el("option", { value: val, selected: value === val }, txt));
    }
    inputs[name] = sel;
    return el("label", { class: "field" }, [el("span", {}, label), sel]);
  };
  const num = (name, label, value, step = "any") => {
    const input = el("input", { type: "number", name, step, value: value ?? "", inputmode: "decimal" });
    inputs[name] = input;
    return el("label", { class: "field" }, [el("span", {}, label), input]);
  };

  form.append(select("goal", "Objetivo", LABELS.goal, profile.goal));
  form.append(num("calorie_adjustment_kcal", "Ajuste kcal (déficit/superávit)", profile.calorie_adjustment_kcal));
  form.append(num("manual_calorie_override", "Override kcal manual (vacío = auto)", profile.manual_calorie_override));
  form.append(num("protein_g_per_kg", "Proteína g/kg", profile.protein_g_per_kg));
  form.append(num("fat_pct_of_calories", "% calorías de grasa (0-1)", profile.fat_pct_of_calories));

  const notes = el("input", { type: "text", name: "notes", value: profile.notes || "", placeholder: "Notas" });
  inputs.notes = notes;
  form.append(el("label", { class: "field field--wide" }, [el("span", {}, "Notas"), notes]));

  form.append(el("button", { type: "submit", class: "btn btn--primary field--wide" }, "Guardar diales"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const patch = {};
    for (const [name, input] of Object.entries(inputs)) {
      const v = input.value.trim();
      if (input.type === "number") {
        patch[name] = v === "" ? null : Number(v);
      } else {
        patch[name] = v === "" ? null : v;
      }
    }
    try {
      await Profile.update(profile.id, patch);
      toast("Diales actualizados");
      renderNutrition(root);
    } catch (err) {
      showError(err);
    }
  });

  card.append(form);
  return card;
}
