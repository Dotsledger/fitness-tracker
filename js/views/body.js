// ============================================================================
// Vista: Cuerpo (mediciones de la Tanita, histórico y gráficas)
// ============================================================================

import { BodyMetrics } from "../db.js";
import {
  el, clear, loading, fmt, fmtDate, today, daysAgo, toast, showError, confirmAction, emptyState,
} from "../utils.js";
import { lineChart, CHART_COLORS } from "../charts.js";

export async function renderBody(root) {
  loading(root);
  const metrics = await BodyMetrics.list(500);
  const latest = metrics.length ? metrics[metrics.length - 1] : null;

  clear(root);
  root.append(el("h1", { class: "view-title" }, "Cuerpo"));

  if (latest) root.append(summaryCard(latest));
  root.append(newMetricCard(root));
  root.append(chartsCard(metrics));
  root.append(metricsTableCard(metrics, root));
}

// ---------------------------------------------------------------------------
function summaryCard(m) {
  const grid = el("div", { class: "grid grid--stats" }, [
    stat("Peso", m.weight_kg != null ? fmt(m.weight_kg) + " kg" : "—",
      `hace ${daysAgo(m.measured_at)} d · ${fmtDate(m.measured_at)}`),
    stat("% Grasa", m.body_fat_pct != null ? fmt(m.body_fat_pct) + " %" : "—", ""),
    stat("Músculo", m.muscle_mass_kg != null ? fmt(m.muscle_mass_kg) + " kg" : "—", ""),
    stat("Visceral", m.visceral_fat_rating != null ? fmt(m.visceral_fat_rating) : "—",
      m.metabolic_age != null ? `edad metab. ${fmt(m.metabolic_age, 0)}` : ""),
  ]);
  return grid;
}
function stat(label, value, sub) {
  return el("div", { class: "card card--stat" }, [
    el("div", { class: "stat__label" }, label),
    el("div", { class: "stat__value" }, value),
    sub ? el("div", { class: "stat__sub" }, sub) : null,
  ]);
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
      renderBody(root);
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
          try { await BodyMetrics.remove(m.id); toast("Eliminada"); renderBody(root); }
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
