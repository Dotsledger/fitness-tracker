// ============================================================================
// Bootstrap de la app · navegación + rutas + service worker
// ============================================================================

import { CONFIGURED } from "./db.js";
import { defineRoute, setOutlet, setNotFound, startRouter } from "./router.js";
import { el } from "./utils.js";

import { renderDashboard } from "./views/dashboard.js";
import { renderRoutine } from "./views/routine.js";
import { renderWorkout } from "./views/workout.js";
import { renderHistory } from "./views/history.js";
import { renderNutrition } from "./views/nutrition.js";
import { renderBody } from "./views/body.js";
import { renderExercises } from "./views/exercises.js";

const NAV = [
  { path: "/", label: "Inicio", icon: "🏠" },
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

function boot() {
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

  defineRoute("/", guard(renderDashboard));
  defineRoute("/workout", guard(renderWorkout));
  defineRoute("/routine", guard(renderRoutine));
  defineRoute("/history", guard(renderHistory));
  defineRoute("/history/:id", guard(renderHistory));
  defineRoute("/nutrition", guard(renderNutrition));
  defineRoute("/body", guard(renderBody));
  defineRoute("/exercises", guard(renderExercises));
  setNotFound((root) => {
    root.innerHTML = `<div class="empty"><div class="empty__title">Página no encontrada</div><a class="btn" href="#/">Ir al inicio</a></div>`;
  });

  buildChrome();
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
