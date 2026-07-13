// ============================================================================
// Configuración de Supabase (frontend)
// ============================================================================
// Rellena estos dos valores con los de TU proyecto de Supabase:
//   Supabase Dashboard → Project Settings → API
//     - Project URL   -> SUPABASE_URL
//     - anon public   -> SUPABASE_ANON_KEY   (¡la "anon", NO la service_role!)
//
// La clave "anon" es pública por diseño: puede vivir en el frontend. La
// seguridad real la dan las políticas RLS (ver db/schema.sql) + que la URL
// no esté indexada. NUNCA pongas aquí la service_role key.
//
// Nota: este archivo SÍ se versiona (lo necesita GitHub Pages). Al ser una app
// personal de un solo usuario sin datos de terceros, es un compromiso asumido.
// ============================================================================

export const SUPABASE_URL = "https://unpillxzxkyoahietzrj.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVucGlsbHh6eGt5b2FoaWV0enJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5Mzc4OTAsImV4cCI6MjA5OTUxMzg5MH0.W_IR5ILddQWCGn96Vu50AqyYYc6gzRZjgl01SgRaWAE";

// Multiplicadores de actividad para el cálculo de TDEE (Katch-McArdle).
export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  athlete: 1.9,
};

// Etiquetas legibles para los selects de la UI.
export const LABELS = {
  activity_level: {
    sedentary: "Sedentario",
    light: "Ligero",
    moderate: "Moderado",
    high: "Alto",
    athlete: "Atleta",
  },
  goal: {
    cut: "Definición (cut)",
    bulk: "Volumen (bulk)",
    maintain: "Mantenimiento",
    recomp: "Recomposición",
  },
  sex: {
    male: "Hombre",
    female: "Mujer",
  },
};
