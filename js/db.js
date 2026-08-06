// ============================================================================
// Capa de datos · cliente Supabase + helpers de consulta por tabla
// ============================================================================
// Supabase JS v2 se carga como global (window.supabase) desde el CDN en
// index.html. Aquí creamos el cliente y exponemos funciones finas por tabla
// para que las vistas no repitan strings de tabla por todas partes.
// ============================================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { getActiveProfileId } from "./active-profile.js";

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

// Id del perfil activo. Todas las consultas por-persona pasan por aquí: si
// falta, es un error de arranque y preferimos fallar antes que devolver (o
// escribir) los datos del otro perfil.
function pid() {
  const id = getActiveProfileId();
  if (!id) throw new Error("No hay perfil activo seleccionado.");
  return id;
}

// ---- Profile (una fila por persona) ----------------------------------------
export const Profile = {
  // SIN filtrar: es la que alimenta el selector de perfil. El orden importa:
  // el primero es el que se elige cuando el navegador no tiene ninguno guardado.
  list() {
    return run(
      sb.from("profile").select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
    );
  },
  async get() {
    const rows = await run(sb.from("profile").select("*").eq("id", pid()).limit(1));
    return rows[0] || null;
  },
  async update(id, patch) {
    patch.updated_at = new Date().toISOString();
    return run(sb.from("profile").update(patch).eq("id", id).select().single());
  },
  insert(row) {
    return run(sb.from("profile").insert(row).select().single());
  },
};

// ---- Body metrics ----------------------------------------------------------
export const BodyMetrics = {
  latest() {
    return run(
      sb.from("body_metrics").select("*").eq("profile_id", pid())
        .order("measured_at", { ascending: false }).limit(1)
    ).then((r) => r[0] || null);
  },
  // Las N mediciones más RECIENTES, devueltas en orden ascendente (para gráficas).
  list(limit = 500) {
    return run(
      sb.from("body_metrics").select("*").eq("profile_id", pid())
        .order("measured_at", { ascending: false }).limit(limit)
    ).then((rows) => rows.reverse());
  },
  // Sella el perfil aquí para que ningún llamador (importador de CSV) lo olvide.
  insertMany(rows) {
    const owned = rows.map((r) => ({ ...r, profile_id: pid() }));
    return run(sb.from("body_metrics").insert(owned).select());
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

// ---- Programas de rutina (bloques de entrenamiento, uno activo por perfil) ---
export const RoutinePrograms = {
  list() {
    return run(
      sb.from("routine_programs").select("*").eq("profile_id", pid())
        .order("created_at", { ascending: true })
    );
  },
  async active() {
    const rows = await run(
      sb.from("routine_programs").select("*").eq("profile_id", pid()).eq("is_active", true).limit(1)
    );
    return rows[0] || null;
  },
  insert(row) {
    return run(sb.from("routine_programs").insert({ ...row, profile_id: pid() }).select().single());
  },
  update(id, patch) {
    return run(sb.from("routine_programs").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("routine_programs").delete().eq("id", id));
  },
  // Activa un programa desactivando los demás DEL MISMO PERFIL (2 llamadas, sin
  // transacción: el peor caso es 0 activos, no 2 — además la BD lo garantiza con
  // el índice único parcial uq_active_program_per_profile).
  async activate(id) {
    await run(
      sb.from("routine_programs").update({ is_active: false })
        .eq("profile_id", pid()).neq("id", id).select()
    );
    return run(sb.from("routine_programs").update({ is_active: true }).eq("id", id).select().single());
  },
};

// ---- Calendario semanal del programa (weekday 0=lunes … 6=domingo) ----------
export const RoutineSchedule = {
  byProgram(programId) {
    return run(
      sb.from("routine_schedule")
        .select("*, day:routine_days(*)")
        .eq("program_id", programId)
        .order("weekday", { ascending: true })
    );
  },
  // Upsert por (programa, día de semana): crea la fila si no existía.
  set(programId, weekday, patch) {
    return run(
      sb.from("routine_schedule")
        .upsert({ program_id: programId, weekday, ...patch }, { onConflict: "program_id,weekday" })
        .select()
    );
  },
  insert(row) {
    return run(sb.from("routine_schedule").insert(row).select().single());
  },
};

// ---- Routine days ----------------------------------------------------------
// Heredan el perfil a través de program_id, así que hay que acotar SIEMPRE por
// programa(s): sin acotar devolvemos [] en vez de los días de los dos perfiles.
export const RoutineDays = {
  list({ includeInactive = false, programId = null, programIds = null } = {}) {
    const ids = programIds ?? (programId ? [programId] : []);
    if (!ids.length) return Promise.resolve([]);
    let q = sb.from("routine_days").select("*").in("program_id", ids)
      .order("day_order", { ascending: true });
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

// ---- Biblioteca de alimentos + comidas componibles ---------------------------
export const Foods = {
  list({ includeInactive = false } = {}) {
    let q = sb.from("foods").select("*").order("name", { ascending: true });
    if (!includeInactive) q = q.eq("is_active", true);
    return run(q);
  },
  insert(row) {
    return run(sb.from("foods").insert(row).select().single());
  },
  update(id, patch) {
    return run(sb.from("foods").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("foods").delete().eq("id", id));
  },
};

export const MealSlots = {
  list() {
    return run(
      sb.from("meal_slots").select("*").eq("profile_id", pid())
        .order("slot_order", { ascending: true })
    );
  },
  // Usado al crear un perfil nuevo para sembrarle sus comidas base.
  insertMany(rows) {
    const owned = rows.map((r) => ({ ...r, profile_id: pid() }));
    return run(sb.from("meal_slots").insert(owned).select());
  },
};

export const MealItems = {
  // Acotado a las comidas del perfil (el llamador pasa los ids de sus slots).
  list(slotIds) {
    if (!slotIds?.length) return Promise.resolve([]);
    return run(
      sb.from("meal_items")
        .select("*, food:foods(*)")
        .in("meal_slot_id", slotIds)
        .order("item_order", { ascending: true })
    );
  },
  insert(row) {
    return run(sb.from("meal_items").insert(row).select("*, food:foods(*)").single());
  },
  update(id, patch) {
    return run(sb.from("meal_items").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("meal_items").delete().eq("id", id));
  },
  updateQtys(pairs) {
    return Promise.all(pairs.map(({ id, qty }) => MealItems.update(id, { qty })));
  },
};

// ---- Workout sessions ------------------------------------------------------
export const WorkoutSessions = {
  list(limit = 200) {
    return run(
      sb.from("workout_sessions")
        .select("*, routine_day:routine_days(name)")
        .eq("profile_id", pid())
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
    return run(sb.from("workout_sessions").insert({ ...row, profile_id: pid() }).select().single());
  },
  update(id, patch) {
    return run(sb.from("workout_sessions").update(patch).eq("id", id).select().single());
  },
  remove(id) {
    return run(sb.from("workout_sessions").delete().eq("id", id));
  },
  // ¿Existe alguna sesión registrada con alguno de estos días de rutina?
  // (para impedir borrar un programa cuyo historial se perdería en cascada)
  async hasAnyForDays(dayIds) {
    if (!dayIds.length) return false;
    const rows = await run(
      sb.from("workout_sessions").select("id").in("routine_day_id", dayIds).limit(1)
    );
    return rows.length > 0;
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
  // profile_id se sella aquí (es NOT NULL en la BD): las series se consultan
  // por exercise_id, que es catálogo COMPARTIDO, así que no basta con la sesión.
  insert(row) {
    return run(sb.from("workout_sets").insert({ ...row, profile_id: pid() }).select().single());
  },
  insertMany(rows) {
    const owned = rows.map((r) => ({ ...r, profile_id: pid() }));
    return run(sb.from("workout_sets").insert(owned).select());
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
        .eq("profile_id", pid())
        .eq("exercise_id", exerciseId)
        .order("created_at", { ascending: true })
        .limit(limit)
    );
  },
  // Historial agrupado por sesión (más reciente primero), excluyendo la sesión
  // actual. Devuelve [{ sessionId, date, sets:[...] }].
  async historyGrouped(exerciseId, excludeSessionId = null, maxSessions = 5) {
    const rows = await run(
      sb.from("workout_sets")
        .select("*, session:workout_sessions(id, session_date)")
        .eq("profile_id", pid())
        .eq("exercise_id", exerciseId)
        .order("created_at", { ascending: false })
        .limit(120)
    );
    const bySession = new Map();
    for (const r of rows) {
      const sid = r.session?.id;
      if (!sid || sid === excludeSessionId) continue;
      if (!bySession.has(sid)) {
        bySession.set(sid, { sessionId: sid, date: r.session.session_date, sets: [] });
      }
      bySession.get(sid).sets.push(r);
    }
    const groups = Array.from(bySession.values())
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, maxSessions);
    groups.forEach((g) => g.sets.sort((a, b) => a.set_number - b.set_number));
    return groups;
  },
};
