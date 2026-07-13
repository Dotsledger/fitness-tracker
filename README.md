# Fitness Tracker

Webapp personal (un solo usuario) para seguimiento de **entrenamiento de fuerza** y **nutrición**. PWA instalable, sin login, con backend en Supabase (Postgres). Pensada para usarse desde tablet e iPhone en el gimnasio y en casa.

La app **no tiene IA**: solo aritmética (cálculo de macros) y CRUD. Las decisiones (ajustar rutina, objetivos calóricos, progresión) se toman fuera, hablando con Claude, que lee/escribe la base de datos **por terminal / SQL** (ver [Acceso por terminal](#acceso-por-terminal-claude--sql)).

---

## Stack

- **Frontend**: HTML/CSS/JS vanilla (ES modules), PWA (manifest + service worker). Chart.js y `@supabase/supabase-js` vía CDN. Sin build step.
- **Backend/DB**: Supabase (Postgres + API REST/JS autogenerada).
- **Hosting**: GitHub Pages.
- **Sin autenticación**: decisión consciente de un solo usuario. RLS activado con políticas explícitas + `robots.txt` con `Disallow: /`.

## Estructura

```
fitness-tracker/
├── index.html            # shell de la app
├── manifest.json         # PWA
├── sw.js                 # service worker (cachea el shell, NO los datos)
├── robots.txt            # noindex
├── .gitignore
├── .env.local.example    # plantilla de credenciales de terminal (copiar a .env.local)
├── db/
│   └── schema.sql        # tablas + índices + RLS + semilla (ejecutar en Supabase)
├── css/styles.css
├── icons/                # iconos PWA (192, 512, maskable)
└── js/
    ├── config.js         # SUPABASE_URL + anon key (frontend) ← EDITAR
    ├── db.js             # cliente Supabase + helpers por tabla
    ├── macros.js         # cálculo Katch-McArdle
    ├── charts.js         # helpers Chart.js
    ├── router.js         # router por hash
    ├── utils.js          # DOM, formato, toasts
    ├── app.js            # bootstrap, nav, rutas
    └── views/            # dashboard, routine, workout, history, nutrition, exercises
```

---

## Puesta en marcha

### 1. Crear la base de datos
En el proyecto de Supabase → **SQL Editor** → pega y ejecuta el contenido completo de [`db/schema.sql`](db/schema.sql). Crea las tablas, índices, políticas RLS y una fila de `profile` por defecto.

### 2. Configurar el frontend
Edita [`js/config.js`](js/config.js) con los valores de **Project Settings → API**:
- `SUPABASE_URL` → *Project URL*
- `SUPABASE_ANON_KEY` → *anon public* (¡la **anon**, NO la service_role!)

La clave anon es pública por diseño; puede vivir en el frontend. La seguridad la dan RLS + `robots.txt`.

### 3. Credenciales de terminal (para Claude / SQL)
```bash
cp .env.local.example .env.local
# rellena SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y DATABASE_URL
```
`.env.local` está en `.gitignore`: **nunca se versiona**.

### 4. Probar en local
Sirve la carpeta con cualquier servidor estático (el service worker necesita HTTP, no `file://`):
```bash
cd fitness-tracker
python3 -m http.server 8080
# abre http://localhost:8080
```

### 5. Desplegar en GitHub Pages
1. Crea un repo y sube el contenido de esta carpeta a la raíz.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. La app quedará en `https://<usuario>.github.io/<repo>/`. Como todas las rutas son relativas (`./`), funciona en el subdirectorio sin cambios.
4. Instálala: en Android/Chrome "Añadir a pantalla de inicio"; en iPhone/Safari, Compartir → "Añadir a pantalla de inicio".

> Al cambiar archivos del shell, sube `CACHE_VERSION` en [`sw.js`](sw.js) para invalidar la cache del service worker.

---

## Acceso por terminal (Claude / SQL)

Método principal para leer progreso y actualizar rutina/objetivos **sin abrir la web**. Dos vías equivalentes:

### Opción A — SQL directo con `psql`
```bash
source .env.local
psql "$DATABASE_URL"
```

### Opción B — API REST con la service_role (salta RLS)
```bash
source .env.local
curl -s "$SUPABASE_URL/rest/v1/body_metrics?select=*&order=measured_at.desc&limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### Tablas (resumen)
| Tabla | Qué guarda |
|---|---|
| `profile` | Fila única: sexo, altura, actividad, objetivo y **diales** de nutrición. |
| `body_metrics` | Mediciones de la báscula Tanita (peso, %grasa, músculo, agua, visceral, ósea, edad metabólica). |
| `exercises` | Catálogo de ejercicios. |
| `routine_days` | Días de rutina (Push/Pull/Legs…). |
| `routine_exercises` | Ejercicios asignados a cada día (el plan: series/reps objetivo). |
| `workout_sessions` | Sesiones realizadas (fecha + día). |
| `workout_sets` | Series concretas (peso, reps, fallo, RPE). |

El esquema completo con tipos está en [`db/schema.sql`](db/schema.sql).

### Consultas de ejemplo

**Última medición corporal**
```sql
select * from body_metrics order by measured_at desc limit 1;
```

**Evolución de peso y % grasa (últimos 90 días)**
```sql
select measured_at, weight_kg, body_fat_pct, muscle_mass_kg
from body_metrics
where measured_at >= current_date - interval '90 days'
order by measured_at;
```

**Ajustar los diales de nutrición** (esto es lo que tú/Claude tocáis para progresar)
```sql
update profile set
  goal = 'recomp',
  calorie_adjustment_kcal = -150,   -- déficit/superávit sobre el TDEE
  protein_g_per_kg = 2.2,
  fat_pct_of_calories = 0.25,
  updated_at = now();
-- Para forzar calorías fijas ignorando el cálculo:
-- update profile set manual_calorie_override = 2400;
-- Para volver al cálculo automático:
-- update profile set manual_calorie_override = null;
```

**Progresión de un ejercicio (peso máx por sesión)**
```sql
select s.session_date,
       max(ws.weight_kg) as max_weight,
       sum(ws.weight_kg * ws.reps) as volume
from workout_sets ws
join workout_sessions s on s.id = ws.session_id
join exercises e on e.id = ws.exercise_id
where e.name ilike '%press banca%'
group by s.session_date
order by s.session_date;
```

**Añadir un ejercicio al catálogo**
```sql
insert into exercises (name, muscle_group, equipment)
values ('Press banca', 'Pecho', 'Barra');
```

**Montar un día de rutina** (ejemplo: añadir un ejercicio a un día)
```sql
-- 1) crear el día
insert into routine_days (name, day_order) values ('Push', 1) returning id;
-- 2) asignarle ejercicios (usa los id devueltos)
insert into routine_exercises (routine_day_id, exercise_id, exercise_order, target_sets, target_reps)
values ('<routine_day_id>', '<exercise_id>', 1, 4, '8-12');
```

**Última sesión registrada con sus series**
```sql
select s.session_date, rd.name as day, e.name as exercise,
       ws.set_number, ws.weight_kg, ws.reps, ws.is_failure, ws.rpe
from workout_sessions s
left join routine_days rd on rd.id = s.routine_day_id
join workout_sets ws on ws.session_id = s.id
join exercises e on e.id = ws.exercise_id
where s.id = (select id from workout_sessions order by session_date desc, created_at desc limit 1)
order by e.name, ws.set_number;
```

---

## Cálculo de macros (cliente)

Se calcula en [`js/macros.js`](js/macros.js) con la medición más reciente y `profile`:

1. `lean_mass_kg = weight_kg * (1 - body_fat_pct/100)`
2. `BMR = 370 + 21.6 * lean_mass_kg` (Katch-McArdle)
3. `activity_multiplier`: sedentary 1.2 · light 1.375 · moderate 1.55 · high 1.725 · athlete 1.9
4. `TDEE = BMR * activity_multiplier`
5. `target_calories = manual_calorie_override` si existe, si no `TDEE + calorie_adjustment_kcal`
6. `protein_g = protein_g_per_kg * weight_kg`
7. `fat_g = (target_calories * fat_pct_of_calories) / 9`
8. `carbs_g = (target_calories - protein_g*4 - fat_g*9) / 4`

Si la última medición no tiene `body_fat_pct`, no se puede calcular BMR/TDEE (la app lo avisa).

---

## Seguridad (resumen honesto)

- **No hay login**: cualquiera con la URL + la anon key puede leer/escribir vía RLS (las políticas dan acceso total a `anon`). Es un compromiso asumido para un solo usuario.
- Capas reales: URL no indexada (`robots.txt`), claves fuera de repos públicos donde aplique, rate limiting de Supabase.
- La `service_role` (que salta RLS) vive **solo** en `.env.local`, nunca en el frontend ni en git.
- Endurecer sin login completo (futuro): dejar el frontend en solo-lectura y mover la escritura tras la service_role, o exigir una cabecera secreta vía función `SECURITY DEFINER`.

## Pendiente de decidir contigo

- Crear el proyecto Supabase y pegar credenciales (`js/config.js` + `.env.local`).
- Nombre/visibilidad del repo de GitHub.
- Cargar tus ejercicios y días de rutina reales (a mano en la app o por SQL).
