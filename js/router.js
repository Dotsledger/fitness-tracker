// ============================================================================
// Router por hash (#/ruta). Sin dependencias.
// ============================================================================

const routes = new Map();
let outlet = null;
let notFound = null;

export function defineRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function setOutlet(node) {
  outlet = node;
}

export function setNotFound(fn) {
  notFound = fn;
}

export function currentPath() {
  const h = location.hash.replace(/^#/, "");
  return h || "/";
}

export function navigate(path) {
  if (currentPath() === path) {
    render(); // fuerza re-render si ya estamos ahí
  } else {
    location.hash = path;
  }
}

async function render() {
  if (!outlet) return;
  const path = currentPath();
  // Coincidencia exacta o por prefijo con parámetro (#/history/:id)
  let fn = routes.get(path);
  let param = null;
  if (!fn) {
    for (const [pattern, handler] of routes) {
      if (pattern.includes(":")) {
        const base = pattern.split("/:")[0];
        if (path.startsWith(base + "/")) {
          fn = handler;
          param = decodeURIComponent(path.slice(base.length + 1));
          break;
        }
      }
    }
  }
  updateActiveNav(path);
  try {
    if (fn) {
      await fn(outlet, param);
    } else if (notFound) {
      await notFound(outlet);
    }
  } catch (err) {
    console.error(err);
    outlet.innerHTML = `<div class="empty"><div class="empty__title">Error al cargar la vista</div><div class="empty__sub">${
      err?.message || err
    }</div></div>`;
  }
  window.scrollTo(0, 0);
}

function updateActiveNav(path) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const href = a.getAttribute("href").replace(/^#/, "");
    const active = path === href || (href !== "/" && path.startsWith(href));
    a.classList.toggle("is-active", active);
  });
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  render();
}
