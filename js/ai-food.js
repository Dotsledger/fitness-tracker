// ============================================================================
// IA de comida (foto → macros, vía Gemini detrás de la Edge Function
// "estimate-food") + guardado como alimento reutilizable de la biblioteca,
// categoría "🍕 Platos". Responsabilidad única: capturar/redimensionar la
// foto, llamar a la función y devolver el resultado — nunca decide qué hacer
// con él después (eso lo decide quien llama: foods.js, nutrition.js).
// ============================================================================

import { sb, Foods } from "./db.js";
import { el, clear, toast, showError } from "./utils.js";
import { icon } from "./icons.js";

const PLATOS_CAT = "🍕 Platos";

// ---- Imagen: redimensiona al lado mayor y exporta JPEG (evita payloads de
// varios MB de una foto de móvil directa a la Edge Function / Gemini). -------
export function resizeImageToDataUrl(file, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagen inválida"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---- Edge Function -----------------------------------------------------------
async function invoke(body) {
  const { data, error } = await sb.functions.invoke("estimate-food", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function estimateDish(dataUrl, note) {
  return invoke({ mode: "dish", image: dataUrl, note: note || undefined });
}

export function estimateMenu(dataUrl) {
  return invoke({ mode: "menu", image: dataUrl });
}

// ---- Ranking de combinaciones de menú (aritmética pura, sin IA: mismo
// espíritu que macros.js) — producto cartesiano de las opciones de cada curso,
// puntuado por distancia relativa al objetivo (kcal pesa más, luego P/C/G). --
export function rankMenuCombos(courses, target = {}) {
  const groups = (courses || []).filter((c) => c.options?.length);
  if (!groups.length) return [];

  let combos = [[]];
  for (const g of groups) {
    const next = [];
    for (const partial of combos) {
      for (const opt of g.options) next.push([...partial, { course: g.course, ...opt }]);
    }
    combos = next;
  }

  const tKcal = target.kcal || 0, tP = target.protein || 0, tC = target.carbs || 0, tF = target.fat || 0;
  const scored = combos.map((items) => {
    const total = items.reduce((acc, o) => ({
      kcal: acc.kcal + (Number(o.kcal) || 0),
      protein: acc.protein + (Number(o.protein) || 0),
      carbs: acc.carbs + (Number(o.carbs) || 0),
      fat: acc.fat + (Number(o.fat) || 0),
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const score =
      2 * Math.abs(total.kcal - tKcal) / Math.max(tKcal, 1) +
      Math.abs(total.protein - tP) / Math.max(tP, 1) +
      Math.abs(total.carbs - tC) / Math.max(tC, 1) +
      Math.abs(total.fat - tF) / Math.max(tF, 1);
    return { items, total, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored;
}

// ---- Guardar como alimento de biblioteca --------------------------------------
async function uploadPhoto(dataUrl) {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const [, mime, b64] = match;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ext = mime.split("/")[1] || "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await sb.storage.from("food-photos").upload(path, bytes, { contentType: mime });
  if (error) throw error;
  return sb.storage.from("food-photos").getPublicUrl(path).data.publicUrl;
}

async function saveDish(dish, photoDataUrl) {
  const photo_url = photoDataUrl ? await uploadPhoto(photoDataUrl) : null;
  return Foods.insert({
    name: dish.name,
    cat: PLATOS_CAT,
    amount: 1,
    unit: "ud",
    kcal: Math.round(dish.kcal) || 0,
    protein: Math.round(dish.protein) || 0,
    carbs: Math.round(dish.carbs) || 0,
    fat: Math.round(dish.fat) || 0,
    photo_url,
  });
}

function macroLine(t) {
  return `${Math.round(t.kcal)} kcal · P ${Math.round(t.protein)} · C ${Math.round(t.carbs)} · G ${Math.round(t.fat)}`;
}

// ---- UI: bottom-sheet (mismo patrón visual que .ex-sheet) ---------------------
let openSheet = null;
function closeSheet() {
  if (!openSheet) return;
  openSheet.backdrop.remove();
  openSheet.panel.remove();
  document.removeEventListener("keydown", openSheet.onKey);
  openSheet = null;
}

function openSheetShell(title) {
  closeSheet();
  const bodyHost = el("div", { class: "ai-sheet__body" });
  const backdrop = el("div", { class: "menu-backdrop menu-backdrop--dim" });
  backdrop.addEventListener("click", closeSheet);
  const closeBtn = el("button", { class: "ex-sheet__close", type: "button", "aria-label": "Cerrar" }, icon("x", 20));
  closeBtn.addEventListener("click", closeSheet);
  const panel = el("div", { class: "ex-sheet ai-sheet", role: "dialog", "aria-modal": "true", "aria-label": title }, [
    el("div", { class: "ex-sheet__head" }, [el("h2", { class: "ex-sheet__title" }, title), closeBtn]),
    bodyHost,
  ]);
  const onKey = (e) => { if (e.key === "Escape") closeSheet(); };
  document.addEventListener("keydown", onKey);
  document.body.append(backdrop, panel);
  openSheet = { backdrop, panel, onKey };
  return bodyHost;
}

// ---- Foto de un plato → macros + nota opcional → ficha editable → guardar ----
export function openDishCameraSheet({ onSaved } = {}) {
  const body = openSheetShell("Foto del plato");
  let photoDataUrl = null;

  function renderCapture() {
    clear(body);
    const fileInput = el("input", { type: "file", accept: "image/*", capture: "environment", hidden: true });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        photoDataUrl = await resizeImageToDataUrl(file);
        renderCapture();
      } catch (err) { showError(err); }
    });
    const captureBtn = el("button", { type: "button", class: "btn btn--primary" },
      [icon("camera", 18), photoDataUrl ? "Cambiar foto" : "Hacer foto al plato"]);
    captureBtn.addEventListener("click", () => fileInput.click());

    const note = el("textarea", { rows: 2, placeholder: "Nota opcional: lleva alioli, el plato mide 2 cm…" });
    const goBtn = el("button", { type: "button", class: "btn btn--primary", disabled: !photoDataUrl },
      [icon("sparkles", 18), "Estimar con IA"]);
    goBtn.addEventListener("click", () => runEstimate(note.value));

    body.append(...[
      fileInput, captureBtn,
      photoDataUrl ? el("img", { src: photoDataUrl, class: "ai-sheet__img", alt: "" }) : null,
      el("label", { class: "field field--wide" }, [el("span", {}, "Nota (opcional)"), note]),
      goBtn,
    ].filter(Boolean));
  }

  async function runEstimate(note) {
    clear(body);
    body.append(el("div", { class: "loading" }, "Analizando el plato…"));
    try {
      const dish = await estimateDish(photoDataUrl, note);
      renderReview(dish);
    } catch (err) {
      showError(err);
      renderCapture();
    }
  }

  function renderReview(dish) {
    clear(body);
    const name = el("input", { type: "text", value: dish.name || "" });
    const kcal = el("input", { type: "number", value: Math.round(dish.kcal) || 0, step: "1", min: "0", inputmode: "decimal" });
    const protein = el("input", { type: "number", value: Math.round(dish.protein) || 0, step: "1", min: "0", inputmode: "decimal" });
    const carbs = el("input", { type: "number", value: Math.round(dish.carbs) || 0, step: "1", min: "0", inputmode: "decimal" });
    const fat = el("input", { type: "number", value: Math.round(dish.fat) || 0, step: "1", min: "0", inputmode: "decimal" });

    const saveBtn = el("button", { type: "button", class: "btn btn--primary field--wide" }, [icon("save", 18), "Guardar en mi biblioteca"]);
    saveBtn.addEventListener("click", async () => {
      if (!name.value.trim()) return toast("Ponle un nombre al plato", "err");
      saveBtn.disabled = true;
      try {
        const food = await saveDish({
          name: name.value.trim(),
          kcal: Number(kcal.value) || 0,
          protein: Number(protein.value) || 0,
          carbs: Number(carbs.value) || 0,
          fat: Number(fat.value) || 0,
        }, photoDataUrl);
        toast(`"${food.name}" guardado en ${PLATOS_CAT}`);
        closeSheet();
        onSaved?.(food);
      } catch (err) { showError(err); saveBtn.disabled = false; }
    });

    body.append(...[
      photoDataUrl ? el("img", { src: photoDataUrl, class: "ai-sheet__img", alt: "" }) : null,
      el("p", { class: "muted small" }, "Revisa y ajusta lo que haga falta antes de guardar."),
      el("div", { class: "form-grid" }, [
        el("label", { class: "field field--wide" }, [el("span", {}, "Nombre"), name]),
        el("label", { class: "field" }, [el("span", {}, "Kcal"), kcal]),
        el("label", { class: "field" }, [el("span", {}, "Proteína (g)"), protein]),
        el("label", { class: "field" }, [el("span", {}, "Carbohidratos (g)"), carbs]),
        el("label", { class: "field" }, [el("span", {}, "Grasa (g)"), fat]),
      ]),
      saveBtn,
    ].filter(Boolean));
  }

  renderCapture();
}

// ---- Foto de una carta → combinaciones recomendadas → guarda los platos elegidos ----
export function openMenuCameraSheet({ target = {}, onSaved } = {}) {
  const body = openSheetShell("Foto de la carta");
  let photoDataUrl = null;

  function renderCapture() {
    clear(body);
    const fileInput = el("input", { type: "file", accept: "image/*", capture: "environment", hidden: true });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        photoDataUrl = await resizeImageToDataUrl(file);
        runEstimate();
      } catch (err) { showError(err); }
    });
    const captureBtn = el("button", { type: "button", class: "btn btn--primary" }, [icon("camera", 18), "Hacer foto a la carta"]);
    captureBtn.addEventListener("click", () => fileInput.click());
    body.append(
      el("p", { class: "muted small" }, `Buscamos la combinación de menú del día más cercana a lo que esta comida aporta hoy (${macroLine(target)}).`),
      fileInput, captureBtn,
    );
  }

  async function runEstimate() {
    clear(body);
    body.append(el("div", { class: "loading" }, "Leyendo la carta…"));
    try {
      const menuData = await estimateMenu(photoDataUrl);
      renderCombos(menuData);
    } catch (err) {
      showError(err);
      renderCapture();
    }
  }

  function renderCombos(menuData) {
    clear(body);
    const ranked = rankMenuCombos(menuData?.courses, target);
    if (!ranked.length) {
      const retryBtn = el("button", { type: "button", class: "btn" }, "Volver a intentar");
      retryBtn.addEventListener("click", renderCapture);
      body.append(
        el("p", { class: "muted" }, "No he podido identificar platos en la carta. Prueba con una foto más clara."),
        retryBtn,
      );
      return;
    }

    const list = el("div", { class: "ai-sheet__combos" });
    ranked.slice(0, 5).forEach((combo, i) => {
      const row = el("button", { type: "button", class: "ai-sheet__combo" + (i === 0 ? " ai-sheet__combo--best" : "") }, [
        i === 0 ? el("span", { class: "chip" }, "Mejor opción") : null,
        el("div", { class: "ai-sheet__combo-items" }, combo.items.map((it) => el("div", {}, `${it.course}: ${it.name}`))),
        el("div", { class: "muted small" }, macroLine(combo.total)),
      ]);
      row.addEventListener("click", async () => {
        row.disabled = true;
        try {
          const foods = [];
          for (const it of combo.items) {
            foods.push(await Foods.insert({
              name: it.name, cat: PLATOS_CAT, amount: 1, unit: "ud",
              kcal: Math.round(it.kcal) || 0, protein: Math.round(it.protein) || 0,
              carbs: Math.round(it.carbs) || 0, fat: Math.round(it.fat) || 0,
            }));
          }
          toast(`${foods.length} plato(s) guardados en ${PLATOS_CAT}`);
          closeSheet();
          onSaved?.(foods);
        } catch (err) { showError(err); row.disabled = false; }
      });
      list.append(row);
    });

    body.append(
      el("p", { class: "muted small" }, `Objetivo de esta comida hoy: ${macroLine(target)}. Elige la combinación que te vaya mejor.`),
      list,
    );
  }

  renderCapture();
}
