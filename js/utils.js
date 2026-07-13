// ============================================================================
// Utilidades · DOM, formato, fechas, toasts
// ============================================================================

// Crea un elemento con atributos e hijos. `attrs.on` = { click: fn, ... }.
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "on" && v && typeof v === "object") {
      for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    } else if (k === "class") {
      node.className = v;
    } else if (k === "html") {
      node.innerHTML = v;
    } else if (k === "dataset" && v && typeof v === "object") {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (v === true) {
      node.setAttribute(k, "");
    } else if (v !== false && v != null) {
      node.setAttribute(k, v);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Vacía un contenedor.
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// ---- Formato ---------------------------------------------------------------
export function fmt(n, digits = 1) {
  if (n == null || n === "" || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  return num.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function round(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return null;
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
}

// ISO local (YYYY-MM-DD) sin desfase de zona horaria.
export function today() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function daysAgo(iso) {
  if (!iso) return null;
  const then = new Date(iso.slice(0, 10) + "T00:00:00");
  const now = new Date(today() + "T00:00:00");
  return Math.round((now - then) / 86400000);
}

export function ageFrom(birthIso) {
  if (!birthIso) return null;
  const b = new Date(birthIso);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

// ---- Toasts ----------------------------------------------------------------
let toastTimer = null;
export function toast(msg, kind = "ok") {
  let host = document.getElementById("toast");
  if (!host) {
    host = el("div", { id: "toast", class: "toast" });
    document.body.append(host);
  }
  host.textContent = msg;
  host.className = `toast toast--${kind} toast--show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove("toast--show"), 3200);
}

// Muestra el error de forma legible.
export function showError(err) {
  console.error(err);
  const msg = err?.message || err?.error_description || String(err);
  toast(msg, "err");
}

// ---- Confirm ligero --------------------------------------------------------
export function confirmAction(message) {
  return window.confirm(message);
}

// ---- Estado de carga en un contenedor --------------------------------------
export function loading(container, text = "Cargando…") {
  clear(container).append(el("div", { class: "loading" }, text));
}

export function emptyState(text, sub = "") {
  return el("div", { class: "empty" }, [
    el("div", { class: "empty__title" }, text),
    sub ? el("div", { class: "empty__sub" }, sub) : null,
  ]);
}
