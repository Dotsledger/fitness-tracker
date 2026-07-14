// ============================================================================
// Vista: Nutrición y cuerpo (perfil, mediciones, macros, gráficas)
// ============================================================================

import { Profile, BodyMetrics, DietGuidelines, MealPlan } from "../db.js";
import { computeMacros } from "../macros.js";
import { LABELS } from "../config.js";
import {
  el, clear, loading, fmt, fmtDate, today, ageFrom, toast, showError, confirmAction, emptyState,
} from "../utils.js";
import { lineChart, CHART_COLORS } from "../charts.js";

export async function renderNutrition(root) {
  loading(root);
  const [profile, metrics, guidelines, meals] = await Promise.all([
    Profile.get(),
    BodyMetrics.list(500),
    DietGuidelines.list().catch(() => []),
    MealPlan.list().catch(() => []),
  ]);
  const latest = metrics.length ? metrics[metrics.length - 1] : null;
  const macros = computeMacros(profile, latest);

  clear(root);
  root.append(el("h1", { class: "view-title" }, "Nutrición y cuerpo"));

  // ---- Macros calculados ---------------------------------------------------
  root.append(macrosCard(macros));

  // ---- Plan de dieta semanal -----------------------------------------------
  if (guidelines.length || meals.length) {
    root.append(dietPlanCard(guidelines, meals));
  }

  // ---- Nueva medición ------------------------------------------------------
  root.append(newMetricCard(root));

  // ---- Perfil / diales -----------------------------------------------------
  root.append(profileCard(profile, root));

  // ---- Gráficas de evolución ----------------------------------------------
  root.append(chartsCard(metrics));

  // ---- Histórico de mediciones --------------------------------------------
  root.append(metricsTableCard(metrics, root));
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

  for (const [dow, items] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const box = el("details", { class: "menu-day", open: dow === todayDow });
    box.append(el("summary", { class: "menu-day__summary" },
      DAY_NAMES[dow - 1] + (dow === todayDow ? "  ·  HOY" : "")));
    for (const m of items) {
      box.append(el("div", { class: "menu-day__slot" }, [
        el("div", { class: "menu-day__slotname" }, m.slot),
        el("div", { class: "menu-day__menu" }, m.menu),
        m.notes ? el("div", { class: "menu-day__notes" }, m.notes) : null,
      ]));
    }
    card.append(box);
  }
  return card;
}

// ---------------------------------------------------------------------------
function newMetricCard(root) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Añadir medición (Tanita RD-545)"));

  const fields = [
    ["measured_at", "Fecha", "date", today()],
    ["weight_kg", "Peso (kg) *", "number", ""],
    ["body_fat_pct", "% Grasa", "number", ""],
    ["muscle_mass_kg", "Masa muscular (kg)", "number", ""],
    ["body_water_pct", "% Agua", "number", ""],
    ["visceral_fat_rating", "Grasa visceral", "number", ""],
    ["bone_mass_kg", "Masa ósea (kg)", "number", ""],
    ["metabolic_age", "Edad metabólica", "number", ""],
    ["bmr_device", "BMR báscula", "number", ""],
  ];

  const form = el("form", { class: "form-grid" });
  const inputs = {};
  for (const [name, label, type, val] of fields) {
    const input = el("input", { type, name, step: "any", value: val, inputmode: type === "number" ? "decimal" : null });
    inputs[name] = input;
    form.append(el("label", { class: "field" }, [el("span", {}, label), input]));
  }
  const notes = el("input", { type: "text", name: "notes", placeholder: "Notas (opcional)" });
  inputs.notes = notes;
  form.append(el("label", { class: "field field--wide" }, [el("span", {}, "Notas"), notes]));

  form.append(el("button", { type: "submit", class: "btn btn--primary field--wide" }, "Guardar medición"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const row = {};
    for (const [name, input] of Object.entries(inputs)) {
      const v = input.value.trim();
      if (v === "") continue;
      row[name] = input.type === "number" ? Number(v) : v;
    }
    if (row.weight_kg == null) return toast("El peso es obligatorio", "err");
    try {
      await BodyMetrics.insert(row);
      toast("Medición guardada");
      renderNutrition(root);
    } catch (err) {
      showError(err);
    }
  });

  card.append(form);
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

// ---------------------------------------------------------------------------
function chartsCard(metrics) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Evolución"));
  if (metrics.length < 2) {
    card.append(el("p", { class: "muted" }, "Necesitas al menos 2 mediciones."));
    return card;
  }
  const labels = metrics.map((m) => fmtDate(m.measured_at));

  const c1 = el("canvas");
  card.append(el("h3", { class: "sub" }, "Peso y % grasa"));
  card.append(el("div", { class: "chart-wrap" }, c1));

  const c2 = el("canvas");
  card.append(el("h3", { class: "sub" }, "Masa muscular"));
  card.append(el("div", { class: "chart-wrap" }, c2));

  // Se dibujan tras el append (ya están en el DOM cuando se llama abajo).
  queueMicrotask(() => {
    lineChart(c1, {
      labels,
      datasets: [
        { label: "Peso (kg)", data: metrics.map((m) => m.weight_kg), color: CHART_COLORS.weight, yAxisID: "y" },
        { label: "% Grasa", data: metrics.map((m) => m.body_fat_pct), color: CHART_COLORS.fat, yAxisID: "y1" },
      ],
      height: 260,
    });
    lineChart(c2, {
      labels,
      datasets: [
        { label: "Masa muscular (kg)", data: metrics.map((m) => m.muscle_mass_kg), color: CHART_COLORS.muscle },
      ],
      height: 220,
    });
  });
  return card;
}

// ---------------------------------------------------------------------------
function metricsTableCard(metrics, root) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Histórico de mediciones"));
  if (!metrics.length) {
    card.append(emptyState("Sin mediciones todavía", "Añade la primera arriba."));
    return card;
  }

  const rows = [...metrics].reverse(); // más reciente primero
  const table = el("table", { class: "table" });
  table.append(el("thead", {}, el("tr", {}, [
    "Fecha", "Peso", "% Grasa", "Músculo", "% Agua", "Visc.", "Ósea", "Edad met.", "",
  ].map((h) => el("th", {}, h)))));

  const tbody = el("tbody");
  for (const m of rows) {
    const tr = el("tr", {}, [
      el("td", {}, fmtDate(m.measured_at)),
      el("td", {}, fmt(m.weight_kg)),
      el("td", {}, fmt(m.body_fat_pct)),
      el("td", {}, fmt(m.muscle_mass_kg)),
      el("td", {}, fmt(m.body_water_pct)),
      el("td", {}, fmt(m.visceral_fat_rating)),
      el("td", {}, fmt(m.bone_mass_kg)),
      el("td", {}, fmt(m.metabolic_age, 0)),
      el("td", {}, el("button", {
        class: "icon-btn danger", title: "Eliminar",
        on: { click: async () => {
          if (!confirmAction(`¿Eliminar la medición del ${fmtDate(m.measured_at)}?`)) return;
          try { await BodyMetrics.remove(m.id); toast("Eliminada"); renderNutrition(root); }
          catch (err) { showError(err); }
        } },
      }, "🗑")),
    ]);
    tbody.append(tr);
  }
  table.append(tbody);
  card.append(el("div", { class: "table-wrap" }, table));
  return card;
}
