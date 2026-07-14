// ============================================================================
// Vista: Nutrición (macros objetivo, plan de dieta, lista de compra, perfil)
// Las mediciones corporales, histórico y gráficas están en la vista "Cuerpo".
// ============================================================================

import { Profile, BodyMetrics, DietGuidelines, MealPlan, ShoppingList } from "../db.js";
import { computeMacros } from "../macros.js";
import { LABELS } from "../config.js";
import {
  el, clear, loading, fmt, fmtDate, ageFrom, toast, showError,
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

  // ---- Lista de la compra --------------------------------------------------
  if (shopping.length) {
    root.append(shoppingCard(shopping));
  }

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

function recipeBox(raw, refs) {
  const det = el("details", { class: "recipe" });
  det.append(el("summary", { class: "recipe__summary" }, "👨‍🍳 Ver receta"));

  const scalable = raw.includes("{");
  const btns = [];
  if (scalable) {
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
        m.recipe ? recipeBox(m.recipe, recipeRefs) : null,
      ]));
    }
    card.append(box);
  }
  applyServings(recipeRefs);
  return card;
}

// ---------------------------------------------------------------------------
// Lista de la compra. Los tildes se guardan en localStorage (no en la BD):
// es un estado personal y efímero, con botón para reiniciar la semana.
const SHOP_KEY = "ft_shopping_checked";

function loadChecked() {
  try { return new Set(JSON.parse(localStorage.getItem(SHOP_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveChecked(set) {
  localStorage.setItem(SHOP_KEY, JSON.stringify([...set]));
}

function shoppingCard(items) {
  const card = el("div", { class: "card" });
  const checked = loadChecked();

  const header = el("div", { class: "shop-head" }, [
    el("h2", { class: "card__title" }, "🛒 Lista de la compra"),
    el("button", { class: "btn btn--small btn--ghost", on: { click: () => {
      saveChecked(new Set());
      card.querySelectorAll("input[type=checkbox]").forEach((c) => {
        c.checked = false;
        c.closest(".shop-item").classList.remove("shop-item--done");
      });
    } } }, "Reiniciar"),
  ]);
  card.append(header);
  card.append(el("p", { class: "muted small" }, "Para una semana del plan. Marca lo que vayas cogiendo."));

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
        it.qty ? el("span", { class: "shop-item__qty" }, it.qty) : null,
      ]);
      box.addEventListener("change", () => {
        if (box.checked) checked.add(it.id); else checked.delete(it.id);
        saveChecked(checked);
        row.classList.toggle("shop-item--done", box.checked);
      });
      card.append(row);
    }
  }
  return card;
}

// ---------------------------------------------------------------------------
function profileCard(profile, root) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Perfil y diales de nutrición"));

  if (!profile) {
    card.append(el("p", { class: "warn" }, "No hay fila de perfil. Ejecuta db/schema.sql (crea una por defecto)."));
    return card;
  }

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

  form.append(select("sex", "Sexo", LABELS.sex, profile.sex));
  const birth = el("input", { type: "date", name: "birth_date", value: profile.birth_date || "" });
  inputs.birth_date = birth;
  form.append(el("label", { class: "field" }, [
    el("span", {}, `Fecha nacimiento${profile.birth_date ? ` (${ageFrom(profile.birth_date)} años)` : ""}`), birth,
  ]));
  form.append(num("height_cm", "Altura (cm)", profile.height_cm));
  form.append(select("activity_level", "Nivel actividad", LABELS.activity_level, profile.activity_level));
  form.append(select("goal", "Objetivo", LABELS.goal, profile.goal));
  form.append(num("calorie_adjustment_kcal", "Ajuste kcal (déficit/superávit)", profile.calorie_adjustment_kcal));
  form.append(num("manual_calorie_override", "Override kcal manual (vacío = auto)", profile.manual_calorie_override));
  form.append(num("protein_g_per_kg", "Proteína g/kg", profile.protein_g_per_kg));
  form.append(num("fat_pct_of_calories", "% calorías de grasa (0-1)", profile.fat_pct_of_calories));

  const notes = el("input", { type: "text", name: "notes", value: profile.notes || "", placeholder: "Notas" });
  inputs.notes = notes;
  form.append(el("label", { class: "field field--wide" }, [el("span", {}, "Notas"), notes]));

  form.append(el("button", { type: "submit", class: "btn btn--primary field--wide" }, "Guardar perfil"));

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
      toast("Perfil actualizado");
      renderNutrition(root);
    } catch (err) {
      showError(err);
    }
  });

  card.append(form);
  return card;
}
