// ============================================================================
// Ilustración animada del ejercicio + ficha de ayuda
// ============================================================================
// Las ilustraciones son 3 fotogramas SVG (silueta blanca sobre transparente)
// de Workout Guide / Everkinetic (CC BY-SA 4.0) en media/exercises/<slug>/.
// Se pintan como máscara CSS para heredar el color de la app, y se alternan
// en bucle. Tocar la miniatura abre la ficha: animación grande, músculos y
// pasos de ejecución (js/exercise-guide.js) + notas personales del ejercicio.
// Sin media_slug se cae al pictograma genérico (exercise-icons.js).
// ============================================================================

import { el } from "./utils.js";
import { icon } from "./icons.js";
import { exerciseIcon } from "./exercise-icons.js";
import { GUIDE } from "./exercise-guide.js";

// URL absoluta: un url() relativo dentro de una custom property se resolvería
// contra la hoja CSS (/css/…), no contra la página.
const MEDIA_BASE = new URL("media/exercises/", document.baseURI).href;
const FRAMES = 3;

function frameStack(slug, cls) {
  const stack = el("span", { class: "ex-frames " + (cls || ""), "aria-hidden": "true" });
  for (let i = 1; i <= FRAMES; i++) {
    const url = `url("${MEDIA_BASE}${encodeURIComponent(slug)}/frame-${i}.svg")`;
    const f = el("span", { class: "ex-frames__frame", style: `--frame:${url}; --i:${i - 1}` });
    stack.append(f);
  }
  return stack;
}

// Miniatura para listas. `ex` es la fila de exercises (name, media_slug, ...).
export function exerciseMedia(ex, opts = {}) {
  if (!ex?.media_slug) return exerciseIcon(ex?.name);
  const btn = el("button", {
    type: "button",
    class: "ex-media",
    title: "Cómo se hace",
    "aria-label": `Cómo se hace: ${ex.name}`,
  }, frameStack(ex.media_slug));
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openExerciseSheet(ex, opts);
  });
  return btn;
}

let openSheet = null;
function closeSheet() {
  if (!openSheet) return;
  openSheet.backdrop.remove();
  openSheet.panel.remove();
  document.removeEventListener("keydown", openSheet.onKey);
  openSheet = null;
}

// Ficha del ejercicio. opts.extraNote = nota del día de rutina (routine_exercises.notes).
export function openExerciseSheet(ex, opts = {}) {
  closeSheet();
  const guide = GUIDE[ex.media_slug] || null;

  const backdrop = el("div", { class: "menu-backdrop menu-backdrop--dim" });
  backdrop.addEventListener("click", closeSheet);

  const closeBtn = el("button", { class: "ex-sheet__close", type: "button", "aria-label": "Cerrar" }, icon("x", 20));
  closeBtn.addEventListener("click", closeSheet);

  const media = el("div", { class: "ex-sheet__media" }, frameStack(ex.media_slug, "ex-frames--lg"));
  // Tocar la ilustración pausa/reanuda el bucle para estudiar una fase.
  media.addEventListener("click", () => media.classList.toggle("is-paused"));

  const chips = [ex.muscle_group, ex.equipment].filter(Boolean)
    .map((t) => el("span", { class: "chip" }, t));

  const panel = el("div", { class: "ex-sheet", role: "dialog", "aria-modal": "true", "aria-label": ex.name }, [
    el("div", { class: "ex-sheet__head" }, [
      el("h2", { class: "ex-sheet__title" }, ex.name),
      closeBtn,
    ]),
    media,
    chips.length ? el("div", { class: "ex-sheet__chips" }, chips) : null,
    guide ? el("h3", { class: "sub" }, "Cómo se hace") : null,
    guide ? el("ol", { class: "ex-sheet__steps" }, guide.steps.map((s) => el("li", {}, s))) : null,
    guide?.tips?.length
      ? el("div", { class: "ex-sheet__tip" }, [icon("alert", 16), guide.tips.join(" ")])
      : null,
    ex.notes ? el("div", { class: "ex-sheet__note" }, [icon("pencil", 14), ex.notes]) : null,
    opts.extraNote ? el("div", { class: "ex-sheet__note" }, [icon("calendar", 14), opts.extraNote]) : null,
    el("div", { class: "ex-sheet__credit" }, [
      "Ilustración: ",
      el("a", { href: "https://github.com/bryllim/workout-guide", target: "_blank", rel: "noopener" }, "Workout Guide"),
      " / Everkinetic · CC BY-SA 4.0",
    ]),
  ]);

  const onKey = (e) => { if (e.key === "Escape") closeSheet(); };
  document.addEventListener("keydown", onKey);
  document.body.append(backdrop, panel);
  closeBtn.focus();
  openSheet = { backdrop, panel, onKey };
}
