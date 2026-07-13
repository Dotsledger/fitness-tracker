-- ============================================================================
-- fitness-tracker · Esquema Postgres / Supabase
-- ============================================================================
-- Ejecuta este archivo COMPLETO en el SQL Editor de Supabase (una sola vez).
-- Es idempotente en lo razonable: usa "if not exists" / "drop policy if exists"
-- donde tiene sentido, para que puedas re-ejecutarlo sin romper nada.
--
-- Decisión consciente: la app es de un solo usuario y NO tiene login. El
-- frontend usa la clave "anon". Aun así activamos RLS con políticas EXPLÍCITAS
-- (no dejamos las tablas abiertas por defecto). Ver bloque de políticas abajo.
-- ============================================================================

-- Extensión para gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Perfil (fila única)
-- ----------------------------------------------------------------------------
create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  sex text check (sex in ('male','female')) default 'male',
  birth_date date,
  height_cm numeric,
  activity_level text check (activity_level in ('sedentary','light','moderate','high','athlete')) default 'moderate',
  goal text check (goal in ('cut','bulk','maintain','recomp')) default 'recomp',
  formula text default 'katch_mcardle',
  calorie_adjustment_kcal numeric default 0,   -- déficit/superávit manual sobre el TDEE calculado
  manual_calorie_override numeric,             -- si se rellena, ignora el cálculo automático
  protein_g_per_kg numeric default 2.2,        -- gramos de proteína por kg de peso total
  fat_pct_of_calories numeric default 0.25,
  notes text,
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Mediciones de la báscula Tanita RD-545
-- ----------------------------------------------------------------------------
create table if not exists body_metrics (
  id uuid primary key default gen_random_uuid(),
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

-- ----------------------------------------------------------------------------
-- Catálogo de ejercicios
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
-- Días de rutina (ej. Push / Pull / Legs)
-- ----------------------------------------------------------------------------
create table if not exists routine_days (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  day_order int,
  is_active boolean default true
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
  session_date date not null default current_date,
  routine_day_id uuid references routine_days(id),
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_workout_sessions_date on workout_sessions (session_date desc);

-- ----------------------------------------------------------------------------
-- Series concretas registradas en cada sesión
-- ----------------------------------------------------------------------------
create table if not exists workout_sets (
  id uuid primary key default gen_random_uuid(),
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
    'routine_exercises','workout_sessions','workout_sets'
  ];
begin
  foreach t in array tables loop
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
-- Crea la fila única de profile solo si aún no existe ninguna.
insert into profile (goal, calorie_adjustment_kcal, protein_g_per_kg, fat_pct_of_calories, activity_level)
select 'recomp', -125, 2.2, 0.25, 'moderate'
where not exists (select 1 from profile);

-- (Opcional) unos días de rutina vacíos para empezar. Descomenta si quieres.
-- insert into routine_days (name, day_order) values
--   ('Push', 1), ('Pull', 2), ('Legs', 3)
-- on conflict do nothing;

-- ============================================================================
-- Fin del esquema
-- ============================================================================
