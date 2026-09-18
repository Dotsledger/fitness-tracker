// ============================================================================
// Vista: Nutrición (macros objetivo, plan de dieta, calculadora)
// Las mediciones corporales, histórico y gráficas están en la vista "Cuerpo".
// ============================================================================

import { Profile, BodyMetrics, Foods, Menus, MealSlots, MealItems, DEFAULT_SLOTS } from "../db.js";
import { computeMacros } from "../macros.js";
import { LABELS } from "../config.js";
import { el, clear, loading, fmt, fmtDate, toast, showError, ageFrom } from "../utils.js";
import { CHART_COLORS } from "../charts.js";
import { icon } from "../icons.js";
import { actionMenu } from "../ui.js";
import { navigate } from "../router.js";

export async function renderNutrition(root) {
  loading(root);
  const [profile, latest, menu, menus, foods] = await Promise.all([
    Profile.get(),
    BodyMetrics.latest().catch(() => null),
    Menus.active().catch(() => null),
    Menus.list().catch(() => []),
    Foods.list().catch(() => []),
  ]);
  // Comidas del menú activo, y después sus items (solo los de esas comidas).
  const slots = menu ? await MealSlots.list(menu.id).catch(() => []) : [];
  const items = await MealItems.list(slots.map((s) => s.id)).catch(() => []);
  const macros = computeMacros(profile, latest);

  clear(root);
  root.append(el("h1", { class: "view-title" }, "Nutrición"));

  // ---- Macros calculados ---------------------------------------------------
  root.append(macrosCard(macros));

  // ---- Calculadora de macros (colapsada: se ajusta poco) ---------------------
  root.append(calculatorCard(profile, latest, root));

  // ---- Cuaderno nutricional --------------------------------------------------
  if (menu && slots.length) {
    root.append(dietPlanCard(menu, menus, slots, items, foods, root));
  } else {
    const card = el("div", { class: "card" });
    card.append(el("h2", { class: "card__title" }, [icon("utensils", 18), "Tu dieta"]));
    card.append(el("p", { class: "muted" }, "No hay ningún menú activo. Crea o activa uno en Menús."));
    card.append(el("a", { class: "btn btn--primary", href: "#/menus" }, [icon("book", 18), "Menús"]));
    root.append(card);
  }
}

// ---------------------------------------------------------------------------
// Switcher de menú: cambiar el activo, renombrarlo, duplicarlo o crear uno
// nuevo sin salir de Nutrición. "Gestionar menús…" lleva a la vista completa
// (#/menus) para lo que se usa poco: eliminar, o renombrar uno que no esté activo.
function openMenuSwitcher(anchor, activeMenu, menus, root) {
  actionMenu(anchor, [
    ...menus.map((m) => ({
      icon: m.id === activeMenu.id ? "check" : "book",
      label: m.name,
      onClick: async () => {
        if (m.id === activeMenu.id) return;
        try {
          await Menus.activate(m.id);
          toast(`Menú activo: ${m.name}`);
          renderNutrition(root);
        } catch (e) { showError(e); }
      },
    })),
    {
      icon: "pencil", label: "Renombrar",
      onClick: async () => {
        const name = prompt("Nuevo nombre del menú", activeMenu.name);
        if (name == null || !name.trim()) return;
        try { await Menus.update(activeMenu.id, { name: name.trim() }); renderNutrition(root); }
        catch (e) { showError(e); }
      },
    },
    {
      icon: "copy", label: "Duplicar",
      onClick: async () => {
        try {
          const activeSlots = await MealSlots.list(activeMenu.id);
          const copy = await Menus.duplicate(activeMenu, activeSlots);
          toast(`Duplicado como "${copy.name}"`);
          renderNutrition(root);
        } catch (e) { showError(e); }
      },
    },
    {
      icon: "plus", label: "Nuevo menú",
      onClick: async () => {
        const name = prompt("Nombre del nuevo menú (p.ej. Comida fuera)");
        if (name == null || !name.trim()) return;
        try {
          const created = await Menus.insert({ name: name.trim() });
          await MealSlots.insertMany(DEFAULT_SLOTS.map((s) => ({ ...s, menu_id: created.id })));
          toast("Menú creado (aún no está activo)");
          renderNutrition(root);
        } catch (e) { showError(e); }
      },
    },
    { icon: "folder", label: "Gestionar menús…", onClick: () => navigate("/menus") },
  ], { title: "Menú" });
}

// ---------------------------------------------------------------------------
function macrosCard(macros) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Macros objetivo (hoy)"));
  if (!macros || macros.targetCalories == null) {
    card.append(el("p", { class: "muted" },
      "Faltan datos para calcular. Necesitas una medición de peso y el perfil (altura/edad/sexo) completo."));
    if (macros?.warnings?.length) {
      macros.warnings.forEach((w) => card.append(el("p", { class: "warn" }, [icon("alert", 16), w])));
    }
    return card;
  }

  const kcal = el("div", { class: "kcal-big" }, [
    el("span", { class: "kcal-big__num" }, fmt(macros.targetCalories, 0)),
    el("span", { class: "kcal-big__unit" }, "kcal/día"),
    el("span", { class: "chip" }, macros.calorieSource === "manual" ? "override manual" : "calculado"),
  ]);
  card.append(kcal);

  const leanNote = macros.proteinBasis === "lean" ? ` · proteína sobre ${fmt(macros.leanMass, 1)} kg magros` : "";
  const detail = el("div", { class: "kcal-detail muted" },
    `TMB ${fmt(macros.bmr, 0)} · TDEE ${fmt(macros.tdee, 0)} · ${macros.age ?? "—"} años · ×${macros.activityMultiplier}${leanNote}`);
  card.append(detail);

  const macroGrid = el("div", { class: "grid grid--macros" });
  macroGrid.append(macroTile("Proteína", macros.protein, CHART_COLORS.muscle));
  macroGrid.append(macroTile("Carbohidratos", macros.carbs, CHART_COLORS.reps));
  macroGrid.append(macroTile("Grasa", macros.fat, CHART_COLORS.fat));
  card.append(macroGrid);

  if (macros.warnings?.length) {
    macros.warnings.forEach((w) => card.append(el("p", { class: "warn" }, [icon("alert", 16), w])));
  }
  return card;
}

function macroTile(name, m, color) {
  return el("div", { class: "macro-tile", style: `--c:${color}` }, [
    el("div", { class: "macro-tile__name" }, name),
    el("div", { class: "macro-tile__g" }, `${fmt(m.g, 0)} g`),
    el("div", { class: "macro-tile__pct" }, m.pct != null ? `${fmt(m.pct, 0)}% · ${fmt(m.kcal, 0)} kcal` : "—"),
  ]);
}

// ---------------------------------------------------------------------------
// Cuaderno nutricional: cada comida (meal_slot) contiene alimentos de la
// biblioteca (meal_items → foods). Cada fila tiene un multiplicador (×1 =
// ración base del alimento) que recalcula fila/subtotal/total en vivo; el
// botón Guardar persiste las cantidades. Añadir/quitar alimentos se hace
// por comida con el select de la biblioteca y el botón ✕ de cada fila.
function fmtG(n) {
  return (n ?? 0).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Cantidad total (g/ml/ud): sin decimales de relleno (60 g, 2,5 ud).
function fmtAmt(n) {
  return (n ?? 0).toLocaleString("es-ES", { maximumFractionDigits: 1 });
}

function dietPlanCard(menu, menus, slots, items, foods, root) {
  const card = el("div", { class: "card" });

  const switchBtn = el("button", {
    type: "button", class: "menu-switch", title: "Cambiar de menú",
  }, [
    icon("book", 16),
    el("span", { class: "menu-switch__name" }, menu.name),
    icon("chevron-down", 14),
  ]);
  switchBtn.addEventListener("click", () => openMenuSwitcher(switchBtn, menu, menus, root));

  const libBtn = el("a", {
    class: "icon-btn", href: "#/foods",
    title: "Biblioteca de alimentos", "aria-label": "Biblioteca de alimentos",
  }, icon("package", 18));

  card.append(el("div", { class: "ledger-head" }, [
    el("h2", { class: "card__title" }, [icon("utensils", 18), "Tu dieta"]),
    el("div", { class: "ledger-head__actions" }, [libBtn, switchBtn]),
  ]));

  card.append(el("h3", { class: "sub" }, "Cuaderno nutricional"));
  card.append(el("p", { class: "muted small" },
    "Cambia la cantidad (×1 = ración base), añade o quita alimentos de cada comida, y los totales se recalculan solos."));

  const grandKcal = el("span", { class: "ledger-grand__kcal" }, "0");
  const grandP = el("span", {}, "0 g");
  const grandC = el("span", {}, "0 g");
  const grandF = el("span", {}, "0 g");
  card.append(el("div", { class: "ledger-summary" }, [
    el("div", { class: "ledger-summary__top" }, [grandKcal, el("span", { class: "muted" }, " kcal / día")]),
    el("div", { class: "ledger-summary__chips" }, [
      el("span", { class: "ledger-chip" }, [el("span", { class: "ledger-dot ledger-dot--p" }), "Proteína ", grandP]),
      el("span", { class: "ledger-chip" }, [el("span", { class: "ledger-dot ledger-dot--c" }), "Carbohidratos ", grandC]),
      el("span", { class: "ledger-chip" }, [el("span", { class: "ledger-dot ledger-dot--f" }), "Grasa ", grandF]),
    ]),
  ]));

  // Columnas de macros colapsadas por defecto; el botón las despliega y la
  // preferencia se recuerda entre sesiones (localStorage).
  const MACROS_KEY = "ft_ledger_macros";
  let macrosVisible = localStorage.getItem(MACROS_KEY) === "1";
  card.classList.toggle("ledger-lite", !macrosVisible);
  const macroBtn = el("button", { type: "button", class: "ledger-macros-btn" });
  const syncMacroBtn = () => {
    macroBtn.replaceChildren(
      icon(macrosVisible ? "chevron-down" : "chevron-right", 16),
      macrosVisible ? "Ocultar valores nutricionales" : "Ver valores nutricionales"
    );
    macroBtn.setAttribute("aria-expanded", String(macrosVisible));
  };
  macroBtn.addEventListener("click", () => {
    macrosVisible = !macrosVisible;
    localStorage.setItem(MACROS_KEY, macrosVisible ? "1" : "0");
    card.classList.toggle("ledger-lite", !macrosVisible);
    syncMacroBtn();
  });
  syncMacroBtn();
  card.append(macroBtn);

  const sections = []; // { total:{p,h,g,kcal}, active, rows }

  function recalcGrand() {
    let p = 0, h = 0, g = 0, kcal = 0;
    for (const s of sections) {
      if (!s.active) continue;
      p += s.total.p; h += s.total.h; g += s.total.g; kcal += s.total.kcal;
    }
    grandKcal.textContent = String(Math.round(kcal));
    grandP.textContent = fmtG(p) + " g";
    grandC.textContent = fmtG(h) + " g";
    grandF.textContent = fmtG(g) + " g";
  }

  for (const slot of slots) {
    const slotItems = items.filter((it) => it.meal_slot_id === slot.id && it.food);
    const section = { total: { p: 0, h: 0, g: 0, kcal: 0 }, active: !slot.optional, rows: [] };
    sections.push(section);
    const rows = section.rows;

    const subP = el("td", { class: "num" }, "0.0");
    const subH = el("td", { class: "num" }, "0.0");
    const subG = el("td", { class: "num" }, "0.0");
    const subK = el("td", { class: "num" }, "0");

    function recalcSection() {
      let p = 0, h = 0, g = 0, kcal = 0;
      for (const r of rows) {
        const q = parseFloat(r.qty.value);
        const n = isNaN(q) || q < 0 ? 0 : q;
        const f = r.item.food;
        const rp = (f.protein || 0) * n, rh = (f.carbs || 0) * n, rg = (f.fat || 0) * n, rk = (f.kcal || 0) * n;
        r.outAmt.textContent = `${fmtAmt((f.amount || 0) * n)} ${f.unit || ""}`;
        r.outP.textContent = fmtG(rp); r.outH.textContent = fmtG(rh); r.outG.textContent = fmtG(rg); r.outK.textContent = String(Math.round(rk));
        p += rp; h += rh; g += rg; kcal += rk;
      }
      subP.textContent = fmtG(p); subH.textContent = fmtG(h); subG.textContent = fmtG(g); subK.textContent = String(Math.round(kcal));
      section.total = { p, h, g, kcal };
      recalcGrand();
    }

    const tbody = el("tbody");
    function addRow(item) {
      const f = item.food;
      const qty = el("input", { type: "number", class: "ledger-qty", value: String(item.qty ?? 1), step: "0.25", min: "0" });
      const outAmt = el("td", { class: "num ledger-amt" }, "");
      const outP = el("td", { class: "num col-nutri" }, "0.0");
      const outH = el("td", { class: "num col-nutri" }, "0.0");
      const outG = el("td", { class: "num col-nutri" }, "0.0");
      const outK = el("td", { class: "num col-nutri" }, "0");
      const delBtn = el("button", { type: "button", class: "ledger-del", title: `Quitar ${f.name}`, "aria-label": `Quitar ${f.name}` }, icon("x", 16));
      const tr = el("tr", {}, [
        el("td", {}, [f.name, el("div", { class: "ledger-ref" }, `ración base: ${fmt(f.amount, f.amount < 10 ? 2 : 0)} ${f.unit}`)]),
        el("td", { class: "num" }, qty),
        outAmt,
        outP, outH, outG, outK,
        el("td", { class: "num" }, delBtn),
      ]);
      const row = { item, qty, outAmt, outP, outH, outG, outK };
      rows.push(row);
      tbody.append(tr);
      qty.addEventListener("input", recalcSection);
      delBtn.addEventListener("click", async () => {
        try {
          await MealItems.remove(item.id);
          rows.splice(rows.indexOf(row), 1);
          tr.remove();
          recalcSection();
        } catch (err) { showError(err); }
      });
    }
    slotItems.forEach(addRow);

    const table = el("table", { class: "table ledger-table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Ingrediente"),
        el("th", {}, "Cant.(×)"),
        el("th", { class: "num" }, "Total"),
        el("th", { class: "col-nutri" }, "Prot."),
        el("th", { class: "col-nutri" }, "Carb."),
        el("th", { class: "col-nutri" }, "Grasa"),
        el("th", { class: "col-nutri" }, "Kcal"),
        el("th", {}, ""),
      ])),
      tbody,
      el("tfoot", {}, el("tr", { class: "ledger-subtotal" }, [
        el("td", {}, "Subtotal"), el("td", {}), el("td", {}), subP, subH, subG, subK, el("td", {}),
      ])),
    ]);

    // Añadir alimento de la biblioteca a esta comida
    const addForm = el("form", { class: "inline-form inline-form--wrap ledger-add" });
    const sel = el("select", {});
    sel.append(el("option", { value: "" }, "— Alimento —"));
    foods.forEach((f) => sel.append(el("option", { value: f.id }, f.name)));
    const addQty = el("input", { type: "number", value: "1", step: "0.25", min: "0", style: "width:5.5rem", inputmode: "decimal", title: "Cantidad (×ración base)" });
    addForm.append(sel, addQty, el("button", { type: "submit", class: "btn" }, "＋ Añadir"));
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!sel.value) return toast("Elige un alimento", "err");
      try {
        const order = slotItems.length || rows.length
          ? Math.max(0, ...rows.map((r) => r.item.item_order || 0)) + 1 : 1;
        const inserted = await MealItems.insert({
          meal_slot_id: slot.id,
          food_id: sel.value,
          qty: parseFloat(addQty.value) || 1,
          item_order: order,
        });
        addRow(inserted);
        recalcSection();
        sel.value = "";
        addQty.value = "1";
      } catch (err) { showError(err); }
    });

    const headRight = [];
    if (slot.optional) {
      const toggle = el("input", { type: "checkbox" });
      toggle.addEventListener("change", () => { section.active = toggle.checked; recalcGrand(); });
      headRight.push(el("label", { class: "ledger-toggle" }, [toggle, "incluir en el total"]));
    }

    card.append(el("div", { class: "ledger-section" }, [
      el("div", { class: "ledger-section__head" }, [el("h4", { class: "ledger-section__title" }, slot.name), ...headRight]),
      el("div", { class: "table-wrap" }, table),
      addForm,
    ]));

    recalcSection();
  }

  const saveBtn = el("button", { class: "btn btn--primary" }, [icon("save", 18), "Guardar cantidades"]);
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      const pairs = sections.flatMap((s) =>
        s.rows.map((r) => {
          const q = parseFloat(r.qty.value);
          return { id: r.item.id, qty: isNaN(q) || q < 0 ? 1 : q };
        })
      );
      await MealItems.updateQtys(pairs);
      toast("Cantidades guardadas");
    } catch (err) {
      showError(err);
    } finally {
      saveBtn.disabled = false;
    }
  });
  card.append(el("div", { class: "ledger-save" }, [saveBtn]));

  return card;
}

// ---------------------------------------------------------------------------
// Calculadora de macros: recrea la calculadora que ya usaba el usuario
// (TMB → Gasto Energético → TDEE → Objetivo % → macros). Los diales se
// recalculan en vivo con la MISMA función (computeMacros) que usa el resto
// de la app, así la previsualización nunca se desincroniza del cálculo real.
// "Guardar" persiste en profile para que el resto de la app use estos valores.
function calculatorCard(profile, latest, root) {
  // No hay nada que ajustar todavía: aviso simple, sin plegar.
  if (!profile || !latest) {
    const card = el("div", { class: "card" });
    card.append(el("h2", { class: "card__title" }, [icon("calculator", 18), "Calculadora de macros"]));
    card.append(el("p", { class: !profile ? "warn" : "muted" },
      !profile
        ? "No hay fila de perfil. Ejecuta db/schema.sql (crea una por defecto)."
        : "Necesitas una medición de peso (pestaña Cuerpo) para calcular."));
    return card;
  }

  // Se toca poco: colapsada por defecto, se despliega al tocar el título.
  const card = el("details", { class: "card calc-card" });
  card.append(el("summary", { class: "calc-summary" }, [
    icon("calculator", 18),
    el("span", { class: "calc-summary__title" }, "Calculadora de macros"),
    icon("chevron-down", 18, { class: "calc-summary__chev" }),
  ]));

  card.append(el("p", { class: "muted small" },
    "Cambia cualquier dial y los totales se recalculan solos. Pulsa Guardar para que el resto de la app use estos valores."));

  // ---- Diales interactivos ---------------------------------------------------
  const activitySel = el("select", {});
  for (const [val, txt] of Object.entries(LABELS.activity_level)) {
    activitySel.append(el("option", { value: val, selected: profile.activity_level === val }, txt));
  }
  const pctInput = el("input", { type: "number", step: "1", value: profile.calorie_adjustment_pct ?? 0, inputmode: "decimal" });
  const proteinInput = el("input", { type: "number", step: "0.1", value: profile.protein_g_per_kg ?? "", inputmode: "decimal" });
  const fatInput = el("input", { type: "number", step: "0.1", value: profile.fat_g_per_kg ?? "", inputmode: "decimal" });

  // Base de la proteína: peso total o masa magra. El g/kg NO se reescala al
  // cambiar: la misma exigencia por kilo sobre músculo da otra cifra, y eso es
  // justo lo que se quiere ver. El hint indica el rango habitual de cada base.
  const basisSel = el("select", {});
  for (const [val, txt] of Object.entries(LABELS.protein_basis)) {
    basisSel.append(el("option", { value: val, selected: (profile.protein_basis || "total") === val }, txt));
  }

  // ---- Celdas de resultado (se rellenan en recalc) ---------------------------
  const outLean = el("td", { class: "num" }, "—");
  const proteinHint = el("small", { class: "muted" });
  const compareCell = el("td", { class: "muted small calc-note", colspan: "4" });
  const compareRow = el("tr", { hidden: true }, compareCell);
  const outBmr = el("td", { class: "num" }, "—");
  const outTdeeIni = el("td", { class: "num" }, "—");
  const outAdjust = el("td", { class: "num" }, "—");
  const outTdeeFinal = el("td", { class: "num" }, "—");
  const outProteinG = el("td", { class: "num" }, "—");
  const outProteinK = el("td", { class: "num" }, "—");
  const outFatG = el("td", { class: "num" }, "—");
  const outFatK = el("td", { class: "num" }, "—");
  const outCarbsG = el("td", { class: "num" }, "—");
  const outCarbsK = el("td", { class: "num" }, "—");
  const outTotalG = el("td", { class: "num" }, "—");
  const outTotalK = el("td", { class: "num" }, "—");
  const warnBox = el("div", {});

  function recalc() {
    const draft = {
      ...profile,
      activity_level: activitySel.value,
      calorie_adjustment_pct: Number(pctInput.value) || 0,
      protein_g_per_kg: Number(proteinInput.value) || 0,
      fat_g_per_kg: Number(fatInput.value) || 0,
      protein_basis: basisSel.value,
    };
    const m = computeMacros(draft, latest);
    clear(warnBox);
    if (!m) return;

    outLean.textContent = m.leanMass != null ? fmt(m.leanMass, 1) : "—";
    // Equivalencia entre bases: g/kg total = g/kg magro × (1 − % grasa).
    const gkg = Number(proteinInput.value) || 0;
    const leanFrac = m.bodyFat != null ? 1 - m.bodyFat / 100 : null;
    if (m.proteinBasis === "lean") {
      const eqTotal = leanFrac ? ` (≙ ${fmt(gkg * leanFrac, 2)} g/kg de peso total)` : "";
      proteinHint.textContent = ` · sobre ${fmt(m.proteinBase, 1)} kg magros${eqTotal} · habitual 2,3–3,1 g/kg magro`;
    } else {
      const eqLean = leanFrac ? ` (≙ ${fmt(gkg / leanFrac, 2)} g/kg magro)` : "";
      proteinHint.textContent = ` · sobre ${fmt(m.proteinBase, 1)} kg totales${eqLean} · habitual 1,6–2,2 g/kg`;
    }
    // Mismo criterio, otra composición: enseña cómo el % de grasa mueve los gramos.
    if (m.proteinBasis === "lean" && gkg) {
      const w = m.weight;
      const sims = [10, 15, 20, 25, 30].map((bf) => `${bf} % → ${fmt(gkg * w * (1 - bf / 100), 0)} g`).join(" · ");
      compareCell.textContent = `Mismo criterio (${fmt(gkg, 1)} g/kg magro) a ${fmt(w, 1)} kg con otro % de grasa: ${sims}`;
      compareRow.hidden = false;
    } else {
      compareRow.hidden = true;
    }
    outBmr.textContent = fmt(m.bmr, 0);
    outTdeeIni.textContent = fmt(m.tdee, 0);
    outAdjust.textContent = (m.adjustmentKcal > 0 ? "+" : "") + fmt(m.adjustmentKcal, 0);
    outTdeeFinal.textContent = fmt(m.targetCalories, 0);

    outProteinG.textContent = fmt(m.protein.g, 0);
    outProteinK.textContent = fmt(m.protein.kcal, 0);
    outFatG.textContent = fmt(m.fat.g, 0);
    outFatK.textContent = fmt(m.fat.kcal, 0);
    outCarbsG.textContent = fmt(m.carbs.g, 0);
    outCarbsK.textContent = fmt(m.carbs.kcal, 0);
    const totalG = (m.protein.g || 0) + (m.carbs.g || 0) + (m.fat.g || 0);
    const totalK = (m.protein.kcal || 0) + (m.carbs.kcal || 0) + (m.fat.kcal || 0);
    outTotalG.textContent = fmt(totalG, 0);
    outTotalK.textContent = fmt(totalK, 0);

    (m.warnings || []).forEach((w) => warnBox.append(el("p", { class: "warn" }, [icon("alert", 16), w])));
  }
  [activitySel, pctInput, proteinInput, fatInput, basisSel].forEach((inp) => {
    inp.addEventListener("input", recalc);
    inp.addEventListener("change", recalc);
  });

  // ---- Tabla 1: TMB → TDEE → objetivo ----------------------------------------
  const age = profile.birth_date ? ageFrom(profile.birth_date) : null;
  const dateNote = ` · medición del ${fmtDate(latest.measured_at)}`;
  card.append(el("div", { class: "table-wrap" }, el("table", { class: "table calc-table" }, [
    el("tbody", {}, [
      el("tr", {}, [el("td", {}, ["Peso (kg)", el("small", { class: "muted" }, dateNote)]), el("td", { class: "num" }, fmt(latest.weight_kg))]),
      el("tr", {}, [el("td", {}, "% grasa"), el("td", { class: "num" }, latest.body_fat_pct != null ? fmt(latest.body_fat_pct, 1) : "—")]),
      el("tr", {}, [el("td", {}, "Masa magra (kg)"), outLean]),
      el("tr", {}, [el("td", {}, "Edad"), el("td", { class: "num" }, age ?? "—")]),
      el("tr", {}, [el("td", {}, "Altura (cm)"), el("td", { class: "num" }, profile.height_cm ?? "—")]),
      el("tr", {}, [el("td", {}, "TMB"), outBmr]),
      el("tr", {}, [el("td", {}, "Gasto energético"), el("td", { class: "num" }, activitySel)]),
      el("tr", { class: "calc-subtotal" }, [el("td", {}, "TDEE inicial"), outTdeeIni]),
      el("tr", {}, [el("td", {}, "Objetivo (%)"), el("td", { class: "num" }, pctInput)]),
      el("tr", {}, [el("td", {}, "Ajuste (kcal)"), outAdjust]),
      el("tr", { class: "calc-highlight" }, [el("td", {}, "TDEE final (objetivo)"), outTdeeFinal]),
    ]),
  ])));

  // ---- Tabla 2: macros --------------------------------------------------------
  card.append(el("div", { class: "table-wrap" }, el("table", { class: "table calc-table" }, [
    el("thead", {}, el("tr", {}, ["", "g/kg", "Gramos", "Kcal"].map((h) => el("th", {}, h)))),
    el("tbody", {}, [
      el("tr", {}, [el("td", {}, "Base de la proteína"), el("td", { class: "num", colspan: "3" }, basisSel)]),
      el("tr", {}, [el("td", {}, ["Proteína", proteinHint]), el("td", { class: "num" }, proteinInput), outProteinG, outProteinK]),
      compareRow,
      el("tr", {}, [el("td", {}, "Grasa"), el("td", { class: "num" }, fatInput), outFatG, outFatK]),
      el("tr", {}, [el("td", {}, "Carbohidratos"), el("td", { class: "num muted small" }, "resto"), outCarbsG, outCarbsK]),
    ]),
    el("tfoot", {}, el("tr", { class: "calc-highlight" }, [el("td", {}, "TOTAL"), el("td", {}), outTotalG, outTotalK])),
  ])));

  card.append(warnBox);

  const saveBtn = el("button", { class: "btn btn--primary field--wide", type: "button" }, "Guardar");
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      await Profile.update(profile.id, {
        activity_level: activitySel.value,
        calorie_adjustment_pct: Number(pctInput.value) || 0,
        protein_g_per_kg: Number(proteinInput.value) || 0,
        fat_g_per_kg: Number(fatInput.value) || 0,
        protein_basis: basisSel.value,
      });
      toast("Calculadora guardada");
      renderNutrition(root);
    } catch (err) {
      showError(err);
      saveBtn.disabled = false;
    }
  });
  card.append(saveBtn);

  recalc();
  return card;
}
