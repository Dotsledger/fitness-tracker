// ============================================================================
// Tema claro/oscuro · el usuario elige desde la cabecera; si no ha elegido,
// se sigue al sistema. La elección vive en localStorage (ft_theme) y el
// <html data-theme> lo aplica el inline script de index.html ANTES de pintar
// (evita el destello del tema equivocado); aquí solo se cambia en caliente.
// ============================================================================

const KEY = "ft_theme";
const META_COLOR = { dark: "#0b0e14", light: "#f4f5f7" };

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function applyTheme(theme, { persist = true } = {}) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", META_COLOR[t]));
  if (persist) {
    try { localStorage.setItem(KEY, t); } catch { /* sin almacenamiento: solo en memoria */ }
  }
  return t;
}

export function toggleTheme() {
  return applyTheme(currentTheme() === "dark" ? "light" : "dark");
}

// Mientras el usuario no haya elegido, seguimos los cambios del sistema.
export function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* sin almacenamiento */ }
  if (!stored) applyTheme(systemTheme(), { persist: false });
  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener("change", () => {
    let s = null;
    try { s = localStorage.getItem(KEY); } catch { /* sin almacenamiento */ }
    if (!s) applyTheme(systemTheme(), { persist: false });
  });
}
