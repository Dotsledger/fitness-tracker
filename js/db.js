// ============================================================================
// Capa de datos · cliente Supabase + helpers de consulta por tabla
// ============================================================================
// Supabase JS v2 se carga como global (window.supabase) desde el CDN en
// index.html. Aquí creamos el cliente y exponemos funciones finas por tabla
// para que las vistas no repitan strings de tabla por todas partes.
// ============================================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  throw new Error("Supabase JS no se ha cargado (revisa el <script> del CDN en index.html).");
}

export const CONFIGURED =
  !SUPABASE_URL.includes("TU-PROYECTO") && !SUPABASE_ANON_KEY.includes("TU_ANON_KEY");

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Envuelve una llamada de Supabase, lanzando el error si lo hay.
async function run(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ---- Profile (fila única) --------------------------------------------------
export const Profile = {
  async get() {
    const rows = await run(sb.from("profile").select("*").limit(1));
    return rows[0] || null;
  },
  async update(id, patch) {
    patch.updated_at = new Date().toISOString();
    return run(sb.from("profile").update(patch).eq("id", id).select().single());
  },
  async create(patch) {
    return run(sb.from("profile").insert(patch).select().single());
  },
};

// ---- Body metrics ----------------------------------------------------------
export const BodyMetrics = {
  latest() {
    return run(sb.from("body_metrics").select("*").order("measured_at", { ascending: false }).limit(1))
      .then((r) => r[0] || null);
  },
  list(limit = 500) {
    return run(sb.from("body_metrics").select("*").order("measured_at", { ascending: true }).limit(limit));
  },
  insert(row) {
    return run(sb.from("body_metrics").insert(row).select().single());
  },
  update(id, patch) {
    return run(sb.from("body_metrics").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("body_metrics").delete().eq("id", id));
  },
};

// ---- Exercises -------------------------------------------------------------
export const Exercises = {
  list({ includeInactive = false } = {}) {
    let q = sb.from("exercises").select("*").order("name", { ascending: true });
    if (!includeInactive) q = q.eq("is_active", true);
    return run(q);
  },
  insert(row) {
    return run(sb.from("exercises").insert(row).select().single());
  },
  update(id, patch) {
    return run(sb.from("exercises").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("exercises").delete().eq("id", id));
  },
};

// ---- Routine days ----------------------------------------------------------
export const RoutineDays = {
  list({ includeInactive = false } = {}) {
    let q = sb.from("routine_days").select("*").order("day_order", { ascending: true });
    if (!includeInactive) q = q.eq("is_active", true);
    return run(q);
  },
  insert(row) {
    return run(sb.from("routine_days").insert(row).select().single());
  },
  update(id, patch) {
    return run(sb.from("routine_days").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("routine_days").delete().eq("id", id));
  },
};

// ---- Routine exercises (el plan de cada día) -------------------------------
export const RoutineExercises = {
  byDay(dayId) {
    return run(
      sb.from("routine_exercises")
        .select("*, exercise:exercises(*)")
        .eq("routine_day_id", dayId)
        .order("exercise_order", { ascending: true })
    );
  },
  insert(row) {
    return run(sb.from("routine_exercises").insert(row).select("*, exercise:exercises(*)").single());
  },
  update(id, patch) {
    return run(sb.from("routine_exercises").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("routine_exercises").delete().eq("id", id));
  },
};

// ---- Workout sessions ------------------------------------------------------
export const WorkoutSessions = {
  list(limit = 200) {
    return run(
      sb.from("workout_sessions")
        .select("*, routine_day:routine_days(name)")
        .order("session_date", { ascending: false })
        .limit(limit)
    );
  },
  get(id) {
    return run(
      sb.from("workout_sessions").select("*, routine_day:routine_days(name)").eq("id", id).single()
    );
  },
  insert(row) {
    return run(sb.from("workout_sessions").insert(row).select().single());
  },
  update(id, patch) {
    return run(sb.from("workout_sessions").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("workout_sessions").delete().eq("id", id));
  },
  // Nº de sesiones en los últimos `days` días (para la racha del dashboard).
  async recent(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const iso = since.toISOString().slice(0, 10);
    return run(
      sb.from("workout_sessions")
        .select("session_date")
        .gte("session_date", iso)
        .order("session_date", { ascending: false })
    );
  },
};

// ---- Workout sets ----------------------------------------------------------
export const WorkoutSets = {
  bySession(sessionId) {
    return run(
      sb.from("workout_sets")
        .select("*, exercise:exercises(name, muscle_group)")
        .eq("session_id", sessionId)
        .order("exercise_id")
        .order("set_number")
    );
  },
  insert(row) {
    return run(sb.from("workout_sets").insert(row).select().single());
  },
  insertMany(rows) {
    return run(sb.from("workout_sets").insert(rows).select());
  },
  update(id, patch) {
    return run(sb.from("workout_sets").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("workout_sets").delete().eq("id", id));
  },
  // Historial de un ejercicio concreto (con la fecha de cada sesión).
  history(exerciseId, limit = 500) {
    return run(
      sb.from("workout_sets")
        .select("*, session:workout_sessions(session_date)")
        .eq("exercise_id", exerciseId)
        .order("created_at", { ascending: true })
        .limit(limit)
    );
  },
  // La última sesión en la que se hizo este ejercicio, con sus series.
  async lastSetsFor(exerciseId, excludeSessionId = null) {
    let q = sb.from("workout_sets")
      .select("*, session:workout_sessions(id, session_date)")
      .eq("exercise_id", exerciseId)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = await run(q);
    const filtered = excludeSessionId
      ? rows.filter((r) => r.session && r.session.id !== excludeSessionId)
      : rows;
    if (!filtered.length) return [];
    const lastSessionId = filtered[0].session?.id;
    return filtered
      .filter((r) => r.session?.id === lastSessionId)
      .sort((a, b) => a.set_number - b.set_number);
  },
};
