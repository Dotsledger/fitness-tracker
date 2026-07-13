// ============================================================================
// Componentes de UI · menú de acciones (popover / bottom-sheet) + handles
// ============================================================================

import { el, clear } from "./utils.js";

let activeMenu = null;

export function closeMenu() {
  if (activeMenu) {
    activeMenu.backdrop.remove();
    activeMenu.panel.remove();
    activeMenu = null;
  }
}

// Menú de acciones anclado a un botón. En pantallas estrechas se muestra como
// bottom-sheet (patrón móvil); en anchas, como popover junto al botón.
// items: [{ icon, label, danger, onClick, children: [...] }]
export function actionMenu(anchor, items, opts = {}) {
  closeMenu();
  const sheet = window.matchMedia("(max-width: 640px)").matches;
  const backdrop = el("div", { class: "menu-backdrop" + (sheet ? " menu-backdrop--dim" : "") });
  const panel = el("div", { class: sheet ? "menu-sheet" : "menu-pop", role: "menu" });
  backdrop.addEventListener("click", closeMenu);

  const renderList = (list, parentLabel) => {
    clear(panel);
    const title = parentLabel || opts.title;
    if (title) panel.append(el("div", { class: "menu-title" }, title));
    if (parentLabel) {
      const back = el("button", { class: "menu-item", type: "button" }, [
        el("span", { class: "menu-item__icon" }, "‹"), "Volver",
      ]);
      back.addEventListener("click", (ev) => { ev.stopPropagation(); renderList(items, null); });
      panel.append(back);
    }
    for (const it of list) {
      const btn = el("button", { class: "menu-item" + (it.danger ? " menu-item--danger" : ""), type: "button" }, [
        el("span", { class: "menu-item__icon" }, it.icon || ""),
        it.label,
        it.children ? el("span", { class: "menu-item__chev" }, "›") : null,
      ]);
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (it.children) { renderList(it.children, it.label); return; }
        closeMenu();
        it.onClick?.();
      });
      panel.append(btn);
    }
  };
  renderList(items, null);

  document.body.append(backdrop, panel);
  if (!sheet) {
    const r = anchor.getBoundingClientRect();
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    const left = Math.max(8, Math.min(r.right - pw, window.innerWidth - pw - 8));
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }
  activeMenu = { backdrop, panel };
}

// Tirador de arrastre (6 puntos). extraClass distingue contextos ("drag-ex",
// "drag-day") para que cada sortable solo reaccione a los suyos.
export function dragHandle(extraClass = "") {
  const s = el("span", {
    class: ("drag-handle " + extraClass).trim(),
    title: "Arrastra para reordenar",
    "aria-hidden": "true",
  });
  s.innerHTML =
    '<svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor">' +
    '<circle cx="7" cy="4" r="1.6"/><circle cx="13" cy="4" r="1.6"/>' +
    '<circle cx="7" cy="10" r="1.6"/><circle cx="13" cy="10" r="1.6"/>' +
    '<circle cx="7" cy="16" r="1.6"/><circle cx="13" cy="16" r="1.6"/></svg>';
  return s;
}

// Botón "⋯" (kebab vertical) que abre el menú de acciones.
export function kebabButton(label = "Opciones") {
  const b = el("button", { class: "kebab-btn", title: label, "aria-label": label, type: "button" });
  b.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">' +
    '<circle cx="10" cy="4" r="1.9"/><circle cx="10" cy="10" r="1.9"/><circle cx="10" cy="16" r="1.9"/></svg>';
  return b;
}
