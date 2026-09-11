// ============================================================================
// Vista: Cuerpo (mediciones de la Tanita, histórico y gráficas)
// ============================================================================

import { BodyMetrics, Profile } from "../db.js";
import { LABELS } from "../config.js";
import {
  el, clear, loading, fmt, fmtDate, daysAgo, ageFrom, toast, showError, confirmAction, emptyState,
} from "../utils.js";
import { lineChart, CHART_COLORS } from "../charts.js";
import { parseTanitaCsv } from "../tanita-csv.js";
import { icon } from "../icons.js";

export async function renderBody(root) {
  loading(root);
  const [metrics, profile] = await Promise.all([BodyMetrics.list(500), Profile.get()]);
  const latest = metrics.length ? metrics[metrics.length - 1] : null;

  clear(root);
  root.append(el("h1", { class: "view-title" }, "Cuerpo"));

  if (latest) root.append(summaryCard(latest));
  root.append(importCard(root, metrics));
  root.append(chartsCard(metrics));
  root.append(metricsTableCard(metrics, root));
  root.append(personalCard(profile, root));
}

// ---------------------------------------------------------------------------
// Datos personales (sexo, nacimiento, altura, actividad). Los diales de
// nutrición (objetivo, kcal, proteína...) están en la vista Nutrición.
function personalCard(profile, root) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Datos personales"));

  if (!profile) {
    card.append(el("p", { class: "warn" }, "No hay fila de perfil. Ejecuta db/schema.sql (crea una por defecto)."));
    return card;
  }

  const form = el("form", { class: "form-grid" });
  const inputs = {};

  const sexSel = el("select", { name: "sex" });
  for (const [val, txt] of Object.entries(LABELS.sex)) {
    sexSel.append(el("option", { value: val, selected: profile.sex === val }, txt));
  }
  inputs.sex = sexSel;
  form.append(el("label", { class: "field" }, [el("span", {}, "Sexo"), sexSel]));

  const birth = el("input", { type: "date", name: "birth_date", value: profile.birth_date || "" });
  inputs.birth_date = birth;
  form.append(el("label", { class: "field" }, [
    el("span", {}, `Fecha nacimiento${profile.birth_date ? ` (${ageFrom(profile.birth_date)} años)` : ""}`), birth,
  ]));

  const height = el("input", { type: "number", name: "height_cm", step: "any", value: profile.height_cm ?? "", inputmode: "decimal" });
  inputs.height_cm = height;
  form.append(el("label", { class: "field" }, [el("span", {}, "Altura (cm)"), height]));

  const actSel = el("select", { name: "activity_level" });
  for (const [val, txt] of Object.entries(LABELS.activity_level)) {
    actSel.append(el("option", { value: val, selected: profile.activity_level === val }, txt));
  }
  inputs.activity_level = actSel;
  form.append(el("label", { class: "field" }, [el("span", {}, "Nivel actividad"), actSel]));

  form.append(el("button", { type: "submit", class: "btn btn--primary field--wide" }, "Guardar datos"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const patch = {};
    for (const [name, input] of Object.entries(inputs)) {
      const v = input.value.trim();
      patch[name] = v === "" ? null : (input.type === "number" ? Number(v) : v);
    }
    try {
      await Profile.update(profile.id, patch);
      toast("Datos guardados");
      renderBody(root);
    } catch (err) {
      showError(err);
    }
  });

  card.append(form);
  return card;
}

// ---------------------------------------------------------------------------
// Importar el CSV que exporta MyTanita EU. Solo añade fechas que no existan.
function importCard(root, metrics) {
  const existing = new Set(metrics.map((m) => m.measured_at));
  const card = el("details", { class: "card import-card" });
  card.append(el("summary", { class: "import-card__summary" }, [icon("download", 18), "Importar de MyTanita (CSV)"]));
  card.append(el("p", { class: "muted small" },
    "En MyTanita: My measurements → Import/Export → exporta a CSV (o te lo envían por email). Elige aquí el archivo y se añaden solo las mediciones nuevas."));

  const fileInput = el("input", { type: "file", accept: ".csv,text/csv" });
  const status = el("div", { class: "import-status" });
  card.append(el("label", { class: "field field--wide" }, [el("span", {}, "Archivo CSV"), fileInput]));
  card.append(status);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = "Leyendo…";
    try {
      const text = await file.text();
      const { rows } = parseTanitaCsv(text);
      if (!rows.length) { status.textContent = "No encontré mediciones en el archivo."; return; }
      const nuevas = rows.filter((r) => !existing.has(r.measured_at));
      const dup = rows.length - nuevas.length;
      if (!nuevas.length) {
        status.textContent = `El CSV tiene ${rows.length} días, todos ya estaban. Nada que importar.`;
        return;
      }
      status.textContent = `Importando ${nuevas.length} mediciones nuevas…`;
      await BodyMetrics.insertMany(nuevas);
      toast(`${nuevas.length} mediciones importadas${dup ? ` (${dup} ya existían)` : ""}`);
      renderBody(root);
    } catch (err) {
      status.textContent = "";
      showError(err);
    } finally {
      fileInput.value = "";
    }
  });

  return card;
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
// Rangos de fecha de las gráficas. La elección se recuerda (localStorage) para
// que al volver a Cuerpo se vea el mismo tramo.
const RANGE_KEY = "ft_body_range";
const RANGES = [
  { id: "15d", label: "15 d", days: 15 },
  { id: "30d", label: "30 d", days: 30 },
  { id: "3m", label: "3 m", days: 91 },
  { id: "6m", label: "6 m", days: 182 },
  { id: "1y", label: "1 año", days: 365 },
  { id: "all", label: "Todo", days: null },
  { id: "custom", label: "Fechas…", days: null },
];

function loadRange() {
  try {
    const r = JSON.parse(localStorage.getItem(RANGE_KEY) || "null");
    if (r && RANGES.some((x) => x.id === r.id)) return r;
  } catch { /* sin almacenamiento o JSON roto */ }
  return { id: "all", from: null, to: null };
}
function saveRange(r) {
  try { localStorage.setItem(RANGE_KEY, JSON.stringify(r)); } catch { /* modo privado */ }
}
// ISO local de hace n días (mediodía para esquivar el cambio de hora).
function isoDaysAgo(n) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function chartsCard(metrics) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Evolución"));
  if (metrics.length < 2) {
    card.append(el("p", { class: "muted" }, "Necesitas al menos 2 mediciones."));
    return card;
  }

  let range = loadRange();

  // ---- Selector de rango -----------------------------------------------------
  const bar = el("div", { class: "range-bar", role: "group", "aria-label": "Rango de fechas" });
  const buttons = new Map();
  for (const r of RANGES) {
    const b = el("button", { type: "button", class: "range-btn" }, r.label);
    b.addEventListener("click", () => {
      range = { id: r.id, from: range.from, to: range.to };
      if (r.id === "custom" && !range.from) {
        range.from = metrics[0].measured_at;
        range.to = metrics[metrics.length - 1].measured_at;
      }
      saveRange(range);
      apply();
    });
    buttons.set(r.id, b);
    bar.append(b);
  }
  card.append(bar);

  const fromInput = el("input", { type: "date" });
  const toInput = el("input", { type: "date" });
  const custom = el("div", { class: "range-custom" }, [
    el("label", { class: "field" }, [el("span", {}, "Desde"), fromInput]),
    el("label", { class: "field" }, [el("span", {}, "Hasta"), toInput]),
  ]);
  for (const inp of [fromInput, toInput]) {
    inp.addEventListener("change", () => {
      range = { id: "custom", from: fromInput.value || null, to: toInput.value || null };
      saveRange(range);
      apply();
    });
  }
  card.append(custom);

  const info = el("div", { class: "range-info muted small" });
  card.append(info);

  // ---- Gráficas --------------------------------------------------------------
  const c1 = el("canvas");
  const wrap1 = el("div", { class: "chart-wrap" }, c1);
  const c2 = el("canvas");
  const wrap2 = el("div", { class: "chart-wrap" }, c2);
  const empty = el("p", { class: "muted", hidden: true }, "No hay mediciones suficientes en este rango.");
  card.append(el("h3", { class: "sub" }, "Peso y % grasa"), wrap1);
  card.append(el("h3", { class: "sub" }, "Masa muscular"), wrap2);
  card.append(empty);

  function bounds() {
    const def = RANGES.find((r) => r.id === range.id) || RANGES[RANGES.length - 2];
    if (def.id === "custom") return { from: range.from, to: range.to };
    return { from: def.days ? isoDaysAgo(def.days) : null, to: null };
  }

  function apply() {
    for (const [id, b] of buttons) b.setAttribute("aria-pressed", String(id === range.id));
    custom.hidden = range.id !== "custom";
    if (range.id === "custom") { fromInput.value = range.from || ""; toInput.value = range.to || ""; }

    const { from, to } = bounds();
    const rows = metrics.filter((m) => (!from || m.measured_at >= from) && (!to || m.measured_at <= to));
    const enough = rows.length >= 2;
    wrap1.hidden = wrap2.hidden = !enough;
    empty.hidden = enough;
    info.textContent = rows.length
      ? `${rows.length} mediciones · ${fmtDate(rows[0].measured_at)} → ${fmtDate(rows[rows.length - 1].measured_at)}`
      : "0 mediciones en este rango";
    if (!enough) return;

    const labels = rows.map((m) => fmtDate(m.measured_at));
    const pointRadius = rows.length > 90 ? 0 : 2; // con muchos puntos, línea limpia
    queueMicrotask(() => {
      lineChart(c1, {
        labels,
        datasets: [
          { label: "Peso (kg)", data: rows.map((m) => m.weight_kg), color: CHART_COLORS.weight, yAxisID: "y", pointRadius },
          { label: "% Grasa", data: rows.map((m) => m.body_fat_pct), color: CHART_COLORS.fat, yAxisID: "y1", pointRadius },
        ],
        height: 260,
      });
      lineChart(c2, {
        labels,
        datasets: [
          { label: "Masa muscular (kg)", data: rows.map((m) => m.muscle_mass_kg), color: CHART_COLORS.muscle, pointRadius },
        ],
        height: 220,
      });
    });
  }

  apply();
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
      }, icon("trash", 18))),
    ]);
    tbody.append(tr);
  }
  table.append(tbody);
  card.append(el("div", { class: "table-wrap" }, table));
  return card;
}
