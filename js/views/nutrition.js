// ============================================================================
// Vista: Nutrición (macros objetivo, plan de dieta, calculadora)
// Las mediciones corporales, histórico y gráficas están en la vista "Cuerpo".
// ============================================================================

import { Profile, BodyMetrics, Foods, MealSlots, MealItems } from "../db.js";
import { computeMacros } from "../macros.js";
import { LABELS } from "../config.js";
import { el, clear, loading, fmt, toast, showError, ageFrom } from "../utils.js";
import { CHART_COLORS } from "../charts.js";

export async function renderNutrition(root) {
  loading(root);
  const [profile, metrics, slots, items, foods] = await Promise.all([
    Profile.get(),
    BodyMetrics.latest().then((m) => (m ? [m] : [])).catch(() => []),
    MealSlots.list().catch(() => []),
    MealItems.list().catch(() => []),
    Foods.list().catch(() => []),
  ]);
  const latest = metrics.length ? metrics[0] : null;
  const macros = computeMacros(profile, latest);

  clear(root);
  root.append(el("h1", { class: "view-title" }, "Nutrición"));

  // ---- Macros calculados ---------------------------------------------------
  root.append(macrosCard(macros));

  // ---- Cuaderno nutricional --------------------------------------------------
  if (slots.length) {
    root.append(dietPlanCard(slots, items, foods, root));
  }

  // ---- Calculadora de macros -------------------------------------------------
  root.append(calculatorCard(profile, latest, root));
}

// ---------------------------------------------------------------------------
function macrosCard(macros) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "Macros objetivo (hoy)"));
  if (!macros || macros.targetCalories == null) {
    card.append(el("p", { class: "muted" },
      "Faltan datos para calcular. Necesitas una medición de peso y el perfil (altura/edad/sexo) completo."));
    if (macros?.warnings?.length) {
      macros.warnings.forEach((w) => card.append(el("p", { class: "warn" }, "⚠ " + w)));
    }
    return card;
  }

  const kcal = el("div", { class: "kcal-big" }, [
    el("span", { class: "kcal-big__num" }, fmt(macros.targetCalories, 0)),
    el("span", { class: "kcal-big__unit" }, "kcal/día"),
    el("span", { class: "chip" }, macros.calorieSource === "manual" ? "override manual" : "calculado"),
  ]);
  card.append(kcal);

  const detail = el("div", { class: "kcal-detail muted" },
    `TMB ${fmt(macros.bmr, 0)} · TDEE ${fmt(macros.tdee, 0)} · ${macros.age ?? "—"} años · ×${macros.activityMultiplier}`);
  card.append(detail);

  const macroGrid = el("div", { class: "grid grid--macros" });
  macroGrid.append(macroTile("Proteína", macros.protein, CHART_COLORS.muscle));
  macroGrid.append(macroTile("Carbohidratos", macros.carbs, CHART_COLORS.reps));
  macroGrid.append(macroTile("Grasa", macros.fat, CHART_COLORS.fat));
  card.append(macroGrid);

  if (macros.warnings?.length) {
    macros.warnings.forEach((w) => card.append(el("p", { class: "warn" }, "⚠ " + w)));
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

function dietPlanCard(slots, items, foods, root) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "🍽 Tu dieta"));

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
      const outP = el("td", { class: "num" }, "0.0");
      const outH = el("td", { class: "num" }, "0.0");
      const outG = el("td", { class: "num" }, "0.0");
      const outK = el("td", { class: "num" }, "0");
      const delBtn = el("button", { type: "button", class: "ledger-del", title: `Quitar ${f.name}` }, "✕");
      const tr = el("tr", {}, [
        el("td", {}, [f.name, el("div", { class: "ledger-ref" }, `ración base: ${fmt(f.amount, f.amount < 10 ? 2 : 0)} ${f.unit}`)]),
        el("td", { class: "num" }, qty),
        outP, outH, outG, outK,
        el("td", { class: "num" }, delBtn),
      ]);
      const row = { item, qty, outP, outH, outG, outK };
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
      el("thead", {}, el("tr", {}, ["Ingrediente", "Cant.(×)", "Prot.", "Carb.", "Grasa", "Kcal", ""].map((h) => el("th", {}, h)))),
      tbody,
      el("tfoot", {}, el("tr", { class: "ledger-subtotal" }, [
        el("td", {}, "Subtotal"), el("td", {}), subP, subH, subG, subK, el("td", {}),
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

  const saveBtn = el("button", { class: "btn btn--primary" }, "💾 Guardar cantidades");
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
  card.append(el("div", { class: "ledger-save" }, [
    saveBtn,
    el("a", { class: "btn btn--ghost", href: "#/foods" }, "🥫 Biblioteca de alimentos"),
  ]));

  return card;
}

// ---------------------------------------------------------------------------
// Calculadora de macros: recrea la calculadora que ya usaba el usuario
// (TMB → Gasto Energético → TDEE → Objetivo % → macros). Los diales se
// recalculan en vivo con la MISMA función (computeMacros) que usa el resto
// de la app, así la previsualización nunca se desincroniza del cálculo real.
// "Guardar" persiste en profile para que el resto de la app use estos valores.
function calculatorCard(profile, latest, root) {
  const card = el("div", { class: "card" });
  card.append(el("h2", { class: "card__title" }, "🧮 Calculadora de macros"));

  if (!profile) {
    card.append(el("p", { class: "warn" }, "No hay fila de perfil. Ejecuta db/schema.sql (crea una por defecto)."));
    return card;
  }
  if (!latest) {
    card.append(el("p", { class: "muted" }, "Necesitas una medición de peso (pestaña Cuerpo) para calcular."));
    return card;
  }

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

  const goalSel = el("select", {});
  for (const [val, txt] of Object.entries(LABELS.goal)) {
    goalSel.append(el("option", { value: val, selected: profile.goal === val }, txt));
  }
  const overrideInput = el("input", {
    type: "number", step: "any", value: profile.manual_calorie_override ?? "",
    inputmode: "decimal", placeholder: "vacío = automático",
  });
  const notesInput = el("input", { type: "text", value: profile.notes || "" });

  // ---- Celdas de resultado (se rellenan en recalc) ---------------------------
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
      goal: goalSel.value,
      activity_level: activitySel.value,
      calorie_adjustment_pct: Number(pctInput.value) || 0,
      protein_g_per_kg: Number(proteinInput.value) || 0,
      fat_g_per_kg: Number(fatInput.value) || 0,
      manual_calorie_override: overrideInput.value.trim() === "" ? null : Number(overrideInput.value),
    };
    const m = computeMacros(draft, latest);
    clear(warnBox);
    if (!m) return;

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

    (m.warnings || []).forEach((w) => warnBox.append(el("p", { class: "warn" }, "⚠ " + w)));
  }
  [activitySel, pctInput, proteinInput, fatInput, overrideInput].forEach((inp) => {
    inp.addEventListener("input", recalc);
    inp.addEventListener("change", recalc);
  });

  // ---- Tabla 1: TMB → TDEE → objetivo ----------------------------------------
  const age = profile.birth_date ? ageFrom(profile.birth_date) : null;
  card.append(el("div", { class: "table-wrap" }, el("table", { class: "table calc-table" }, [
    el("tbody", {}, [
      el("tr", {}, [el("td", {}, "Peso (kg)"), el("td", { class: "num" }, fmt(latest.weight_kg))]),
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
      el("tr", {}, [el("td", {}, "Proteína"), el("td", { class: "num" }, proteinInput), outProteinG, outProteinK]),
      el("tr", {}, [el("td", {}, "Grasa"), el("td", { class: "num" }, fatInput), outFatG, outFatK]),
      el("tr", {}, [el("td", {}, "Carbohidratos"), el("td", { class: "num muted small" }, "resto"), outCarbsG, outCarbsK]),
    ]),
    el("tfoot", {}, el("tr", { class: "calc-highlight" }, [el("td", {}, "TOTAL"), el("td", {}), outTotalG, outTotalK])),
  ])));

  card.append(warnBox);

  // ---- Objetivo, override manual, notas, guardar -----------------------------
  card.append(el("div", { class: "form-grid" }, [
    el("label", { class: "field" }, [el("span", {}, "Objetivo"), goalSel]),
    el("label", { class: "field" }, [el("span", {}, "Override kcal manual"), overrideInput]),
    el("label", { class: "field field--wide" }, [el("span", {}, "Notas"), notesInput]),
  ]));

  const saveBtn = el("button", { class: "btn btn--primary field--wide", type: "button" }, "Guardar");
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      await Profile.update(profile.id, {
        goal: goalSel.value,
        activity_level: activitySel.value,
        calorie_adjustment_pct: Number(pctInput.value) || 0,
        protein_g_per_kg: Number(proteinInput.value) || 0,
        fat_g_per_kg: Number(fatInput.value) || 0,
        manual_calorie_override: overrideInput.value.trim() === "" ? null : Number(overrideInput.value),
        notes: notesInput.value.trim() || null,
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
