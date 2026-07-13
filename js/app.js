// ============================================================================
// Bootstrap de la app · gate de login + navegación + rutas + service worker
// ============================================================================

import { CONFIGURED } from "./db.js";
import { getSession, signOut, onAuthChange } from "./auth.js";
import { defineRoute, setOutlet, setNotFound, startRouter, renderCurrent } from "./router.js";
import { el, clear } from "./utils.js";
import { renderLogin } from "./views/login.js";

import { renderDashboard } from "./views/dashboard.js";
import { renderRoutine } from "./views/routine.js";
import { renderWorkout } from "./views/workout.js";
import { renderHistory } from "./views/history.js";
import { renderNutrition } from "./views/nutrition.js";
import { renderExercises } from "./views/exercises.js";

const NAV = [
  { path: "/", label: "Inicio", icon: "🏠" },
  { path: "/workout", label: "Entreno", icon: "🏋" },
  { path: "/routine", label: "Rutina", icon: "🗓" },
  { path: "/history", label: "Historial", icon: "📈" },
  { path: "/nutrition", label: "Nutrición", icon: "🥗" },
  { path: "/exercises", label: "Ejercicios", icon: "📋" },
];

let routesDefined = false;

// ---- Chrome (tabbar + botón salir) ----------------------------------------
function buildChrome() {
  document.querySelector(".tabbar")?.remove();
  const nav = el("nav", { class: "tabbar", "aria-label": "Navegación principal" });
  for (const item of NAV) {
    nav.append(el("a", { href: "#" + item.path, "data-nav": true, class: "tabbar__item" }, [
      el("span", { class: "tabbar__icon" }, item.icon),
      el("span", { class: "tabbar__label" }, item.label),
    ]));
  }
  document.body.append(nav);
  addLogout();
}

function addLogout() {
  const topbar = document.querySelector(".topbar");
  if (!topbar || topbar.querySelector(".logout-btn")) return;
  const btn = el("button", { class: "logout-btn", title: "Cerrar sesión" }, "Salir");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    await signOut();
  });
  topbar.append(btn);
}

function teardownChrome() {
  document.querySelector(".tabbar")?.remove();
  document.querySelector(".logout-btn")?.remove();
}

// ---- Rutas -----------------------------------------------------------------
function defineRoutes() {
  defineRoute("/", renderDashboard);
  defineRoute("/workout", renderWorkout);
  defineRoute("/routine", renderRoutine);
  defineRoute("/history", renderHistory);
  defineRoute("/history/:id", renderHistory);
  defineRoute("/nutrition", renderNutrition);
  defineRoute("/exercises", renderExercises);
  setNotFound((root) => {
    root.innerHTML = `<div class="empty"><div class="empty__title">Página no encontrada</div><a class="btn" href="#/">Ir al inicio</a></div>`;
  });
}

// ---- Pantallas -------------------------------------------------------------
function showConfig(app) {
  teardownChrome();
  clear(app);
  app.append(el("div", { class: "config-banner" }, [
    el("strong", {}, "⚠ Supabase sin configurar. "),
    "Edita ", el("code", {}, "js/config.js"),
    " con tu URL y anon key.",
  ]));
}

function mountApp(app) {
  clear(app);
  const outlet = el("main", { class: "outlet", id: "outlet" });
  app.append(outlet);
  setOutlet(outlet);
  if (!routesDefined) { defineRoutes(); routesDefined = true; }
  buildChrome();
  startRouter(); // idempotente: registra el listener una sola vez y renderiza
}

// Decide qué mostrar según haya sesión o no. Se llama al arrancar y en cada
// cambio de sesión (login/logout).
async function render() {
  const app = document.getElementById("app");
  if (!CONFIGURED) return showConfig(app);

  const session = await getSession();
  if (!session) {
    teardownChrome();
    renderLogin(app, () => render());
    return;
  }
  mountApp(app);
}

// ---- Arranque --------------------------------------------------------------
onAuthChange(() => render()); // reacciona a SIGNED_IN / SIGNED_OUT
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW no registrado:", e));
  });
}
