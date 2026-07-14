// ============================================================================
// Parser del CSV exportado por MyTanita EU → filas para body_metrics
// ============================================================================
// Maneja: cabecera con nombres, comillas con comas dentro, valores '-' o vacíos
// = null, y varias lecturas el mismo día (se queda la más temprana = mañana).
// ============================================================================

// Parser CSV mínimo que respeta comillas dobles.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

// Mapa: columna del CSV de Tanita -> campo de body_metrics.
const COLS = {
  "Weight (kg)": "weight_kg",
  "Body Fat (%)": "body_fat_pct",
  "Muscle Mass (kg)": "muscle_mass_kg",
  "Body Water (%)": "body_water_pct",
  "Visc Fat": "visceral_fat_rating",
  "Bone Mass (kg)": "bone_mass_kg",
  "Metab Age": "metabolic_age",
  "BMR (kcal)": "bmr_device",
};

function toNum(v) {
  const t = (v || "").trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

// Devuelve { rows, days } — rows es una por día (la más temprana).
export function parseTanitaCsv(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], days: 0 };

  const header = table[0].map((h) => h.trim());
  const dateIdx = header.findIndex((h) => /^date$/i.test(h));
  if (dateIdx === -1) throw new Error("No encuentro la columna 'Date' en el CSV.");

  const colIdx = {};
  for (const [csvName, field] of Object.entries(COLS)) {
    const i = header.findIndex((h) => h === csvName);
    if (i !== -1) colIdx[field] = i;
  }
  if (colIdx.weight_kg == null) throw new Error("No encuentro la columna 'Weight (kg)'. ¿Es un CSV de MyTanita?");

  const byDay = new Map();
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const rawDate = (cells[dateIdx] || "").trim();
    if (!rawDate) continue;
    const day = rawDate.slice(0, 10); // "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;

    const row = { measured_at: day, notes: "import MyTanita CSV" };
    for (const [field, i] of Object.entries(colIdx)) row[field] = toNum(cells[i]);
    if (row.weight_kg == null) continue; // peso obligatorio

    const prev = byDay.get(day);
    if (!prev || rawDate < prev._raw) byDay.set(day, { ...row, _raw: rawDate });
  }

  const rows = [...byDay.values()].sort((a, b) => (a.measured_at < b.measured_at ? -1 : 1));
  rows.forEach((r) => delete r._raw);
  return { rows, days: rows.length };
}
