// ============================================================================
// Bootstrap de la app · navegación + rutas + service worker
// ============================================================================

import { CONFIGURED, Profile, Menus, MealSlots, DEFAULT_SLOTS } from "./db.js";
import { defineRoute, setOutlet, setNotFound, startRouter, navigate, currentPath } from "./router.js";
import { el, clear, toast, showError } from "./utils.js";
import { actionMenu } from "./ui.js";
import {
  getActiveProfile, getActiveProfileId, getProfiles, resolveActive, setActiveProfileId,
} from "./active-profile.js";

import { renderRoutine } from "./views/routine.js";
import { renderWorkout } from "./views/workout.js";
import { renderHistory } from "./views/history.js";
import { renderNutrition } from "./views/nutrition.js";
import { renderBody } from "./views/body.js";
import { renderExercises } from "./views/exercises.js";
import { renderFoods } from "./views/foods.js";
import { renderMenus } from "./views/menus.js";
import { renderPrograms } from "./views/programs.js";

const NAV = [
  { path: "/workout", label: "Entreno", icon: "🏋" },
  { path: "/routine", label: "Rutina", icon: "🗓" },
  { path: "/history", label: "Historial", icon: "📈" },
  { path: "/nutrition", label: "Nutrición", icon: "🥗" },
  { path: "/body", label: "Cuerpo", icon: "⚖️" },
];

function buildChrome() {
  const nav = el("nav", { class: "tabbar", "aria-label": "Navegación principal" });
  for (const item of NAV) {
    nav.append(el("a", { href: "#" + item.path, "data-nav": true, class: "tabbar__item" }, [
      el("span", { class: "tabbar__icon" }, item.icon),
      el("span", { class: "tabbar__label" }, item.label),
    ]));
  }
  document.body.append(nav);
}

// ---------------------------------------------------------------------------
// Selector de perfil · la app la usan varias personas desde la misma URL, sin
// login. Cambiar de perfil solo cambia el id que db.js usa para filtrar, así
// que basta con re-renderizar la vista actual.
// ---------------------------------------------------------------------------
function renderProfileSwitcher() {
  const host = document.querySelector(".topbar__inner");
  if (!host) return;
  host.querySelector(".topbar__profile")?.remove();

  const active = getActiveProfile();
  const btn = el("button", {
    class: "topbar__profile", type: "button", title: "Cambiar de perfil",
  }, `👤 ${active?.name || "—"} ▾`);

  btn.addEventListener("click", () => actionMenu(btn, [
    ...getProfiles().map((p) => ({
      icon: p.id === getActiveProfileId() ? "✓" : "　",
      label: p.name,
      onClick: () => switchProfile(p.id),
    })),
    { icon: "✎", label: "Renombrar perfil", onClick: renameActiveProfile },
    { icon: "＋", label: "Nuevo perfil", onClick: createProfile },
  ], { title: "Perfil" }));

  host.append(btn);
}

function switchProfile(id) {
  if (id === getActiveProfileId()) return;
  setActiveProfileId(id);
  renderProfileSwitcher();
  navigate(currentPath()); // fuerza re-render de la vista con el nuevo perfil
  toast(`Perfil: ${getActiveProfile()?.name ?? ""}`);
}

async function renameActiveProfile() {
  const active = getActiveProfile();
  if (!active) return;
  const name = prompt("Nombre del perfil", active.name);
  if (name == null || !name.trim()) return;
  try {
    await Profile.update(active.id, { name: name.trim() });
    resolveActive(await Profile.list());
    renderProfileSwitcher();
    toast("Perfil renombrado");
  } catch (err) { showError(err); }
}

async function createProfile() {
  const name = prompt("Nombre del nuevo perfil");
  if (name == null || !name.trim()) return;
  try {
    const created = await Profile.insert({ name: name.trim() });
    resolveActive(await Profile.list());
    setActiveProfileId(created.id);
    // Sin menú ni comidas base la pestaña Nutrición saldría vacía sin explicación.
    const menu = await Menus.insert({ name: "Estándar", is_active: true });
    await MealSlots.insertMany(DEFAULT_SLOTS.map((s) => ({ ...s, menu_id: menu.id })));
    renderProfileSwitcher();
    navigate(currentPath());
    toast(`Perfil "${created.name}" creado y activo`);
  } catch (err) { showError(err); }
}

// Resuelve el perfil activo antes de arrancar el router: sin él, db.js no
// puede filtrar nada. Devuelve false si no hay forma de continuar.
async function initProfiles(outlet) {
  try {
    const profiles = await Profile.list();
    if (!profiles.length) throw new Error("No hay ningún perfil en la base de datos.");
    resolveActive(profiles);
    renderProfileSwitcher();
    return true;
  } catch (err) {
    console.error(err);
    resolveActive([]); // conserva el id guardado si lo había
    if (getActiveProfileId()) {
      renderProfileSwitcher();
      return true;
    }
    clear(outlet);
    outlet.append(el("div", { class: "empty" }, [
      el("div", { class: "empty__title" }, "No se pudo cargar el perfil"),
      el("div", { class: "empty__sub" }, err?.message || "Revisa la conexión con Supabase."),
      el("button", {
        class: "btn btn--primary", type: "button",
        on: { click: () => window.location.reload() },
      }, "Reintentar"),
    ]));
    return false;
  }
}

async function boot() {
  const app = document.getElementById("app");

  const outlet = el("main", { class: "outlet", id: "outlet" });
  app.append(outlet);
  setOutlet(outlet);

  // Si Supabase no está configurado, ninguna vista puede leer datos.
  const guard = (fn) => (root, param) => {
    if (!CONFIGURED) {
      root.innerHTML =
        '<div class="empty"><div class="empty__title">Configura Supabase para empezar</div>' +
        '<div class="empty__sub">Edita <code>js/config.js</code> con tu URL y anon key.</div></div>';
      return;
    }
    return fn(root, param);
  };

  defineRoute("/", guard(renderWorkout));
  defineRoute("/workout", guard(renderWorkout));
  defineRoute("/routine", guard(renderRoutine));
  defineRoute("/history", guard(renderHistory));
  defineRoute("/history/:id", guard(renderHistory));
  defineRoute("/nutrition", guard(renderNutrition));
  defineRoute("/body", guard(renderBody));
  defineRoute("/exercises", guard(renderExercises));
  defineRoute("/foods", guard(renderFoods));
  defineRoute("/menus", guard(renderMenus));
  defineRoute("/programs", guard(renderPrograms));
  setNotFound((root) => {
    root.innerHTML = `<div class="empty"><div class="empty__title">Página no encontrada</div><a class="btn" href="#/">Ir a Entreno</a></div>`;
  });

  buildChrome();
  if (CONFIGURED && !(await initProfiles(outlet))) return;
  startRouter();
}

// Registrar el service worker (PWA). Ruta relativa para GitHub Pages.
// Auto-actualización: cuando entra un SW nuevo y toma el control, recargamos
// una sola vez para que el cliente nunca se quede con una versión vieja.
if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((reg) => reg.update())
      .catch((e) => console.warn("SW no registrado:", e));
  });
}

boot();
