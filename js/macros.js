// ============================================================================
// Cálculo de macros · aritmética pura (sin IA)
// ============================================================================
// TMB con Mifflin-St Jeor (peso/altura/edad/sexo). La proteína puede calcularse
// sobre el peso total o sobre la MASA MAGRA (peso × (1 − % grasa)): la
// necesidad de proteína la marca el músculo a conservar, no la grasa. Se usa
// siempre la ÚLTIMA medición real (no una media): con pesajes espaciados,
// promediar varios días atrás deja el objetivo por detrás de la tendencia
// real. Todo el "cerebro" (ajustar diales) lo lleva el usuario desde la
// calculadora de Nutrición.
// ============================================================================

import { ACTIVITY_MULTIPLIERS } from "./config.js";
import { ageFrom } from "./utils.js";

// Recibe el profile y la última medición corporal. Devuelve el desglose o
// null si falta lo mínimo (peso).
export function computeMacros(profile, metric) {
  if (!profile || !metric || metric.weight_kg == null) return null;

  const weight = Number(metric.weight_kg);
  const height = profile.height_cm != null ? Number(profile.height_cm) : null;
  const age = profile.birth_date ? ageFrom(profile.birth_date) : null;
  const sex = profile.sex;
  const bodyFat = metric.body_fat_pct != null && metric.body_fat_pct !== "" ? Number(metric.body_fat_pct) : null;
  const leanMass = bodyFat != null ? weight * (1 - bodyFat / 100) : null;

  // 1. BMR (Mifflin-St Jeor). Necesita altura, edad y sexo.
  let bmr = null;
  if (height != null && age != null && sex) {
    bmr = 10 * weight + 6.25 * height - 5 * age + (sex === "female" ? -161 : 5);
  }

  // 2. Multiplicador de actividad (Gasto Energético)
  const mult = ACTIVITY_MULTIPLIERS[profile.activity_level] ?? 1.375;

  // 3. TDEE (gasto total, SIN ajustar por objetivo)
  const tdee = bmr != null ? bmr * mult : null;

  // 4. Ajuste de objetivo (% sobre el TDEE) → calorías objetivo
  const adjustmentPct = Number(profile.calorie_adjustment_pct || 0);
  const adjustmentKcal = tdee != null ? tdee * (adjustmentPct / 100) : null;

  // 5. Calorías objetivo (override manual si existe)
  let targetCalories = null;
  let calorieSource = null;
  if (profile.manual_calorie_override != null && profile.manual_calorie_override !== "") {
    targetCalories = Number(profile.manual_calorie_override);
    calorieSource = "manual";
  } else if (tdee != null) {
    targetCalories = tdee + adjustmentKcal;
    calorieSource = "calculated";
  }

  // 6. Base de la proteína: masa magra si se pidió Y hay % de grasa; si no, total.
  const wantsLean = profile.protein_basis === "lean";
  const proteinBasis = wantsLean && leanMass != null ? "lean" : "total";
  const proteinBase = proteinBasis === "lean" ? leanMass : weight;

  // 7-8. Macros (necesitan calorías objetivo). La grasa sigue sobre peso total.
  let proteinG = null, fatG = null, carbsG = null;
  if (targetCalories != null) {
    proteinG = Number(profile.protein_g_per_kg || 0) * proteinBase;
    fatG = Number(profile.fat_g_per_kg || 0) * weight;
    carbsG = (targetCalories - proteinG * 4 - fatG * 9) / 4;
  }

  const proteinKcal = proteinG != null ? proteinG * 4 : null;
  const fatKcal = fatG != null ? fatG * 9 : null;
  const carbsKcal = carbsG != null ? carbsG * 4 : null;

  const pct = (kcal) =>
    kcal != null && targetCalories ? (kcal / targetCalories) * 100 : null;

  return {
    weight,
    height,
    age,
    bodyFat,
    leanMass,
    proteinBasis,
    proteinBase,
    bmr,
    activityMultiplier: mult,
    tdee, // gasto total sin ajustar (para mostrar como contexto)
    adjustmentPct,
    adjustmentKcal,
    targetCalories,
    calorieSource,
    protein: { g: proteinG, kcal: proteinKcal, pct: pct(proteinKcal) },
    fat: { g: fatG, kcal: fatKcal, pct: pct(fatKcal) },
    carbs: { g: carbsG, kcal: carbsKcal, pct: pct(carbsKcal) },
    // Avisos útiles para la UI:
    warnings: buildWarnings({ height, age, sex, carbsG, wantsLean, leanMass }),
  };
}

function buildWarnings({ height, age, sex, carbsG, wantsLean, leanMass }) {
  const w = [];
  if (height == null || age == null || !sex) {
    w.push("Faltan datos personales (altura, fecha de nacimiento o sexo) para calcular el TMB. Completa 'Datos personales' en Cuerpo.");
  }
  if (wantsLean && leanMass == null) {
    w.push("La medición no trae % de grasa: la proteína se calcula sobre el peso total.");
  }
  if (carbsG != null && carbsG < 0) {
    w.push("Los carbohidratos salen negativos: proteína + grasa ya superan las calorías objetivo. Baja g/kg de proteína o de grasa.");
  }
  return w;
}
