// ============================================================================
// Vista: Dashboard
// ============================================================================

import { Profile, BodyMetrics, WorkoutSessions } from "../db.js";
import { computeMacros } from "../macros.js";
import { el, clear, loading, fmt, fmtDate, daysAgo } from "../utils.js";
import { lineChart, CHART_COLORS } from "../charts.js";

export async function renderDashboard(root) {
  loading(root);

  const [profile, latest, metrics, recent] = await Promise.all([
    Profile.get(),
    BodyMetrics.latest(),
    BodyMetrics.list(60),
    WorkoutSessions.recent(30),
  ]);

  const macros = computeMacros(profile, latest);
  clear(root);

  root.append(el("h1", { class: "view-title" }, "Dashboard"));

  // ---- Fila de tarjetas resumen -------------------------------------------
  const grid = el("div", { class: "grid grid--stats" });

  grid.append(statCard("Peso", latest ? fmt(latest.weight_kg) + " kg" : "—",
    latest ? `hace ${daysAgo(latest.measured_at)} d · ${fmtDate(latest.measured_at)}` : "sin mediciones"));
  grid.append(statCard("% Grasa", latest?.body_fat_pct != null ? fmt(latest.body_fat_pct) + " %" : "—",
    latest?.muscle_mass_kg != null ? `Músculo ${fmt(latest.muscle_mass_kg)} kg` : ""));
  grid.append(statCard("Calorías objetivo", macros?.targetCalories != null ? fmt(macros.targetCalories, 0) + " kcal" : "—",
    macros ? (macros.calorieSource === "manual" ? "override manual" : `TDEE ${fmt(macros.tdee, 0)}`) : "faltan datos"));
  grid.append(statCard("Entrenos (30d)", String(recent.length),
    streakLabel(recent)));

  root.append(grid);

  // ---- Macros objetivo -----------------------------------------------------
  const macroCard = el("div", { class: "card" });
  macroCard.append(el("h2", { class: "card__title" }, "Macros objetivo"));
  if (macros?.targetCalories != null) {
    macroCard.append(macroRow("Proteína", macros.protein, CHART_COLORS.muscle));
    macroCard.append(macroRow("Carbohidratos", macros.carbs, CHART_COLORS.reps));
    macroCard.append(macroRow("Grasa", macros.fat, CHART_COLORS.fat));
  } else {
    macroCard.append(el("p", { class: "muted" },
      "Añade una medición con % de grasa y completa el perfil para ver los macros."));
  }
  macroCard.append(el("a", { class: "btn btn--ghost", href: "#/nutrition" }, "Ir a Nutrición →"));
  root.append(macroCard);

  // ---- Mini-gráfica peso + % grasa ----------------------------------------
  const chartCard = el("div", { class: "card" });
  chartCard.append(el("h2", { class: "card__title" }, "Evolución peso / % grasa"));
  if (metrics.length >= 2) {
    const canvasWrap = el("div", { class: "chart-wrap" });
    const canvas = el("canvas");
    canvasWrap.append(canvas);
    chartCard.append(canvasWrap);
    root.append(chartCard);
    lineChart(canvas, {
      labels: metrics.map((m) => fmtDate(m.measured_at)),
      datasets: [
        { label: "Peso (kg)", data: metrics.map((m) => m.weight_kg), color: CHART_COLORS.weight, yAxisID: "y" },
        { label: "% Grasa", data: metrics.map((m) => m.body_fat_pct), color: CHART_COLORS.fat, yAxisID: "y1" },
      ],
      height: 260,
    });
  } else {
    chartCard.append(el("p", { class: "muted" }, "Necesitas al menos 2 mediciones para ver la gráfica."));
    root.append(chartCard);
  }

  // ---- Accesos rápidos -----------------------------------------------------
  const quick = el("div", { class: "grid grid--actions" });
  quick.append(el("a", { class: "btn btn--primary", href: "#/workout" }, "＋ Registrar entreno"));
  quick.append(el("a", { class: "btn", href: "#/body" }, "＋ Añadir medición"));
  root.append(quick);
}

function statCard(label, value, sub) {
  return el("div", { class: "card card--stat" }, [
    el("div", { class: "stat__label" }, label),
    el("div", { class: "stat__value" }, value),
    sub ? el("div", { class: "stat__sub" }, sub) : null,
  ]);
}

function macroRow(name, m, color) {
  const pct = m.pct != null ? Math.max(0, Math.min(100, m.pct)) : 0;
  return el("div", { class: "macro-row" }, [
    el("div", { class: "macro-row__head" }, [
      el("span", { class: "macro-row__name" }, [
        el("span", { class: "dot", style: `background:${color}` }), name,
      ]),
      el("span", { class: "macro-row__val" },
        `${fmt(m.g, 0)} g · ${m.pct != null ? fmt(m.pct, 0) + "%" : "—"}`),
    ]),
    el("div", { class: "bar" }, [
      el("div", { class: "bar__fill", style: `width:${pct}%; background:${color}` }),
    ]),
  ]);
}

function streakLabel(recent) {
  if (!recent.length) return "sin entrenos";
  const last = recent[0].session_date;
  return `último hace ${daysAgo(last)} d`;
}
