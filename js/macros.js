// ============================================================================
// Cálculo de macros · aritmética pura (sin IA)
// ============================================================================
// Fórmula Katch-McArdle. Todo el "cerebro" (ajustar diales) lo lleva el usuario
// vía SQL sobre la tabla profile. Aquí solo se calcula.
// ============================================================================

import { ACTIVITY_MULTIPLIERS } from "./config.js";

// Recibe el profile y la última medición corporal. Devuelve el desglose o null
// si falta lo mínimo (peso).
export function computeMacros(profile, metric) {
  if (!profile || !metric || metric.weight_kg == null) return null;

  const weight = Number(metric.weight_kg);
  const bf = metric.body_fat_pct != null ? Number(metric.body_fat_pct) : null;

  // 1. Masa magra (necesita % grasa; si no hay, no podemos Katch-McArdle).
  const leanMass = bf != null ? weight * (1 - bf / 100) : null;

  // 2. BMR (Katch-McArdle)
  const bmr = leanMass != null ? 370 + 21.6 * leanMass : null;

  // 3. Multiplicador de actividad
  const mult = ACTIVITY_MULTIPLIERS[profile.activity_level] ?? 1.55;

  // 4. TDEE
  const tdee = bmr != null ? bmr * mult : null;

  // 5. Calorías objetivo
  let targetCalories = null;
  let calorieSource = null;
  if (profile.manual_calorie_override != null && profile.manual_calorie_override !== "") {
    targetCalories = Number(profile.manual_calorie_override);
    calorieSource = "manual";
  } else if (tdee != null) {
    targetCalories = tdee + Number(profile.calorie_adjustment_kcal || 0);
    calorieSource = "calculated";
  }

  // 6-8. Macros (necesitan calorías objetivo)
  let proteinG = null, fatG = null, carbsG = null;
  if (targetCalories != null) {
    proteinG = Number(profile.protein_g_per_kg || 0) * weight;
    fatG = (targetCalories * Number(profile.fat_pct_of_calories || 0)) / 9;
    carbsG = (targetCalories - proteinG * 4 - fatG * 9) / 4;
  }

  const proteinKcal = proteinG != null ? proteinG * 4 : null;
  const fatKcal = fatG != null ? fatG * 9 : null;
  const carbsKcal = carbsG != null ? carbsG * 4 : null;

  const pct = (kcal) =>
    kcal != null && targetCalories ? (kcal / targetCalories) * 100 : null;

  return {
    weight,
    leanMass,
    bmr,
    activityMultiplier: mult,
    tdee,
    targetCalories,
    calorieSource,
    protein: { g: proteinG, kcal: proteinKcal, pct: pct(proteinKcal) },
    fat: { g: fatG, kcal: fatKcal, pct: pct(fatKcal) },
    carbs: { g: carbsG, kcal: carbsKcal, pct: pct(carbsKcal) },
    // Avisos útiles para la UI:
    warnings: buildWarnings({ bf, carbsG }),
  };
}

function buildWarnings({ bf, carbsG }) {
  const w = [];
  if (bf == null) {
    w.push("La última medición no tiene % de grasa: sin él no se puede calcular BMR/TDEE.");
  }
  if (carbsG != null && carbsG < 0) {
    w.push("Los carbohidratos salen negativos: proteína + grasa ya superan las calorías objetivo. Baja g/kg de proteína o el % de grasa.");
  }
  return w;
}
