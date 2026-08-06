-- ============================================================================
-- fitness-tracker · Esquema Postgres / Supabase
-- ============================================================================
-- Ejecuta este archivo COMPLETO en el SQL Editor de Supabase (una sola vez).
-- Es idempotente en lo razonable: usa "if not exists" / "drop policy if exists"
-- donde tiene sentido, para que puedas re-ejecutarlo sin romper nada.
--
-- Decisión consciente: la app NO tiene login. El frontend usa la clave "anon".
-- Aun así activamos RLS con políticas EXPLÍCITAS (no dejamos las tablas
-- abiertas por defecto). Ver bloque de políticas abajo.
--
-- MULTIPERFIL (2026-08): la usan varias personas desde la misma URL, con un
-- selector de perfil en la cabecera. `profile` tiene una fila por persona y las
-- tablas por-persona llevan `profile_id`. `foods` y `exercises` son CATÁLOGOS
-- COMPARTIDOS a propósito. Sin login no hay auth.uid(), así que la separación
-- la aplica la capa de datos (js/db.js filtra por el perfil activo) — la BD solo
-- pone las redes de seguridad: NOT NULL en profile_id e índices.
-- ============================================================================

-- Extensión para gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Perfiles (una fila por persona; raíz de todos los datos por-persona)
-- ----------------------------------------------------------------------------
create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- etiqueta del selector de perfil
  sort_order int default 100,                  -- orden en el selector; el 1º es el que sale por defecto
  sex text check (sex in ('male','female')) default 'male',
  birth_date date,
  height_cm numeric,
  -- multiplicadores: sedentary=1.2 · light_low=1.35 · light=1.375 · moderate=1.55 · high=1.725 · athlete=1.9
  activity_level text check (activity_level in ('sedentary','light_low','light','moderate','high','athlete')) default 'moderate',
  goal text check (goal in ('cut','bulk','maintain','recomp')) default 'recomp',
  formula text default 'mifflin_st_jeor',
  calorie_adjustment_pct numeric default 0,    -- % de ajuste sobre el TDEE inicial (+superávit/-déficit)
  manual_calorie_override numeric,             -- si se rellena, ignora el cálculo automático
  protein_g_per_kg numeric default 2.2,        -- gramos de proteína por kg de peso total
  fat_g_per_kg numeric default 0.8,            -- gramos de grasa por kg de peso total
  notes text,
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Mediciones de la báscula Tanita RD-545
-- ----------------------------------------------------------------------------
create table if not exists body_metrics (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric not null,
  body_fat_pct numeric,
  muscle_mass_kg numeric,
  body_water_pct numeric,
  visceral_fat_rating numeric,
  bone_mass_kg numeric,
  metabolic_age numeric,
  bmr_device numeric,       -- BMR que muestra la propia báscula, solo como referencia
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_body_metrics_measured_at on body_metrics (measured_at desc);
create index if not exists idx_body_metrics_profile on body_metrics (profile_id, measured_at desc);

-- ----------------------------------------------------------------------------
-- Catálogo de ejercicios · COMPARTIDO entre perfiles (sin profile_id)
-- ----------------------------------------------------------------------------
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  equipment text,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Programas de rutina (bloques de entrenamiento). Uno activo POR PERFIL: lo
-- garantiza el índice único parcial de abajo, no solo la app.
-- ----------------------------------------------------------------------------
create table if not exists routine_programs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  name text not null,
  is_active boolean default false,
  created_at timestamptz default now()
);
create unique index if not exists uq_active_program_per_profile
  on routine_programs (profile_id) where is_active;

-- ----------------------------------------------------------------------------
-- Días de rutina (ej. Push / Pull / Legs) — cada día pertenece a un programa,
-- y hereda el perfil a través de él (sin profile_id propio)
-- ----------------------------------------------------------------------------
create table if not exists routine_days (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  day_order int,
  is_active boolean default true,
  program_id uuid references routine_programs(id) on delete cascade
);

-- ----------------------------------------------------------------------------
-- Calendario semanal por programa: qué día de rutina (fuerza) toca cada día
-- de la semana, más una nota libre (cardio, descanso...).
-- ----------------------------------------------------------------------------
create table if not exists routine_schedule (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references routine_programs(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6), -- 0=lunes … 6=domingo
  routine_day_id uuid references routine_days(id) on delete set null, -- null = sin fuerza ese día
  note text,
  unique (program_id, weekday)
);

-- ----------------------------------------------------------------------------
-- Ejercicios asignados a cada día (el plan)
-- ----------------------------------------------------------------------------
create table if not exists routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_day_id uuid references routine_days(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete cascade,
  exercise_order int,
  target_sets int,
  target_reps text,     -- ej. '8-12', 'AMRAP', '5x5'
  target_rest_sec int,  -- descanso recomendado entre series (segundos)
  notes text
);
create index if not exists idx_routine_exercises_day on routine_exercises (routine_day_id, exercise_order);

-- ----------------------------------------------------------------------------
-- Sesiones de entrenamiento realizadas
-- ----------------------------------------------------------------------------
create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  session_date date not null default current_date,
  routine_day_id uuid references routine_days(id),
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_workout_sessions_date on workout_sessions (session_date desc);
create index if not exists idx_workout_sessions_profile on workout_sessions (profile_id, session_date desc);

-- ----------------------------------------------------------------------------
-- Series concretas registradas en cada sesión.
-- profile_id va DESNORMALIZADO aquí (además de venir por session_id) porque el
-- historial de un ejercicio se consulta por exercise_id, y el catálogo de
-- ejercicios es compartido: sin esta columna se mezclarían las series de ambos.
-- ----------------------------------------------------------------------------
create table if not exists workout_sets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  session_id uuid references workout_sessions(id) on delete cascade,
  exercise_id uuid references exercises(id),
  set_number int not null,
  weight_kg numeric,
  reps int,
  is_failure boolean default false,
  rpe numeric,
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_workout_sets_session on workout_sets (session_id);
create index if not exists idx_workout_sets_exercise on workout_sets (exercise_id);
create index if not exists idx_workout_sets_profile_ex on workout_sets (profile_id, exercise_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Cuaderno nutricional: biblioteca de alimentos + comidas componibles.
-- foods = catálogo editable desde la app (/foods), COMPARTIDO entre perfiles.
-- meal_slots = las comidas del día de CADA perfil (menú fijo, igual todos los
-- días). meal_items = qué alimentos lleva cada comida y en qué cantidad
-- (× ración base del alimento); hereda el perfil vía meal_slot_id.
-- ----------------------------------------------------------------------------
create table if not exists foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cat text,                    -- categoría con emoji (ej. "🥛 Lácteos y proteína")
  amount numeric not null,     -- ración base (ej. 30)
  unit text not null,          -- g / ml / ud
  kcal numeric not null default 0,     -- macros POR ración base
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  is_active boolean default true
);

create table if not exists meal_slots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  slot_order int not null,
  name text not null,          -- "Desayuno (post-entreno ~8:30)"
  optional boolean default false  -- merienda: excluida del total por defecto
);
create index if not exists idx_meal_slots_profile on meal_slots (profile_id, slot_order);

create table if not exists meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_slot_id uuid references meal_slots(id) on delete cascade,
  food_id uuid references foods(id) on delete cascade,
  qty numeric not null default 1,
  item_order int
);
create index if not exists idx_meal_items_slot on meal_items (meal_slot_id, item_order);


-- ============================================================================
-- Row Level Security
-- ============================================================================
-- La app NO tiene login (decisión consciente, un solo usuario). El frontend usa
-- el rol "anon". Activamos RLS con una política EXPLÍCITA de acceso total a anon
-- (no queda abierto "por defecto"). No es seguridad fuerte: la protección real
-- es que la URL no está indexada (robots.txt) y que solo tú la conoces.
-- ============================================================================

alter table profile            enable row level security;
alter table body_metrics       enable row level security;
alter table exercises          enable row level security;
alter table routine_days       enable row level security;
alter table routine_exercises  enable row level security;
alter table workout_sessions   enable row level security;
alter table workout_sets       enable row level security;

-- Política única por tabla: acceso total a anon + authenticated.
do $$
declare
  t text;
  tables text[] := array[
    'profile','body_metrics','exercises','routine_days',
    'routine_exercises','workout_sessions','workout_sets',
    'foods','meal_slots','meal_items',
    'routine_programs','routine_schedule'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "authorized_full_access" on %I', t);
    execute format('drop policy if exists "anon_full_access" on %I', t);
    execute format(
      'create policy "anon_full_access" on %I
         for all
         to anon, authenticated
         using (true)
         with check (true)', t);
  end loop;
end $$;

-- ============================================================================
-- Semilla mínima
-- ============================================================================
-- Primer perfil + sus comidas base, solo si la tabla está vacía (en una BD ya
-- en uso esto no hace nada: los perfiles se crean desde el selector de la app,
-- que también siembra las 4 comidas).
insert into profile (name, goal, calorie_adjustment_pct, protein_g_per_kg, fat_g_per_kg, activity_level)
select 'Yo', 'recomp', -15, 2.2, 0.8, 'moderate'
where not exists (select 1 from profile);

insert into meal_slots (profile_id, slot_order, name, optional)
select p.id, v.ord, v.nombre, false
from profile p
cross join (values (1, 'Desayuno'), (2, 'Comida'), (3, 'Merienda'), (4, 'Cena')) as v(ord, nombre)
where not exists (select 1 from meal_slots ms where ms.profile_id = p.id);

-- ============================================================================
-- Fin del esquema
-- ============================================================================
