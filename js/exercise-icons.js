// ============================================================================
// Pictogramas SVG por ejercicio · figuras de palo minimalistas (48×48)
// ============================================================================
// exerciseIcon(nombre) devuelve un <span class="ex-ico"> con el pictograma
// que corresponda según palabras clave del nombre. Color: currentColor.
// ============================================================================

function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Trazos de cada pictograma (contenido interno del SVG).
const ICONS = {
  bench: `
    <line x1="6" y1="36" x2="32" y2="36"/><line x1="10" y1="36" x2="10" y2="42"/><line x1="28" y1="36" x2="28" y2="42"/>
    <circle cx="9" cy="29" r="3.4"/><line x1="13" y1="29" x2="28" y2="29"/>
    <line x1="28" y1="29" x2="34" y2="34"/><line x1="34" y1="34" x2="34" y2="41"/>
    <line x1="16" y1="29" x2="16" y2="17"/><line x1="8" y1="17" x2="26" y2="17"/>
    <line x1="8" y1="13" x2="8" y2="21"/><line x1="26" y1="13" x2="26" y2="21"/>`,
  incline: `
    <line x1="8" y1="40" x2="32" y2="24"/>
    <circle cx="32" cy="16" r="3.3"/>
    <line x1="30" y1="19" x2="21" y2="30"/>
    <line x1="21" y1="30" x2="28" y2="35"/><line x1="28" y1="35" x2="28" y2="42"/>
    <line x1="30" y1="19" x2="30" y2="9"/>
    <line x1="26" y1="9" x2="34" y2="9"/>`,
  pushup: `
    <line x1="6" y1="40" x2="42" y2="40"/>
    <circle cx="12" cy="21" r="3.3"/>
    <line x1="16" y1="24" x2="38" y2="33"/>
    <line x1="18" y1="25" x2="15" y2="38"/>
    <line x1="38" y1="33" x2="40" y2="39"/>`,
  ohp: `
    <circle cx="24" cy="12" r="3.4"/>
    <line x1="24" y1="16" x2="24" y2="29"/>
    <line x1="24" y1="29" x2="19" y2="41"/><line x1="24" y1="29" x2="29" y2="41"/>
    <line x1="21" y1="17" x2="17" y2="8"/><line x1="27" y1="17" x2="31" y2="8"/>
    <line x1="11" y1="8" x2="37" y2="8"/>
    <line x1="11" y1="4" x2="11" y2="12"/><line x1="37" y1="4" x2="37" y2="12"/>`,
  latraise: `
    <circle cx="24" cy="10" r="3.4"/>
    <line x1="24" y1="14" x2="24" y2="28"/>
    <line x1="24" y1="28" x2="19" y2="40"/><line x1="24" y1="28" x2="29" y2="40"/>
    <line x1="24" y1="16" x2="10" y2="15"/><line x1="24" y1="16" x2="38" y2="15"/>
    <line x1="10" y1="11.5" x2="10" y2="18.5"/><line x1="38" y1="11.5" x2="38" y2="18.5"/>`,
  facepull: `
    <line x1="43" y1="4" x2="43" y2="14"/>
    <path d="M43 9 Q33 10 27 13"/>
    <circle cx="17" cy="12" r="3.3"/>
    <line x1="18" y1="16" x2="17" y2="30"/>
    <line x1="17" y1="30" x2="13" y2="41"/><line x1="17" y1="30" x2="21" y2="41"/>
    <line x1="19" y1="17" x2="27" y2="13"/>`,
  pullup: `
    <line x1="10" y1="7" x2="38" y2="7"/>
    <line x1="17" y1="7" x2="22" y2="16"/><line x1="31" y1="7" x2="26" y2="16"/>
    <circle cx="24" cy="12" r="2.9"/>
    <line x1="24" y1="16" x2="24" y2="28"/>
    <line x1="24" y1="28" x2="20" y2="34"/><line x1="20" y1="34" x2="24" y2="39"/>`,
  pulldown: `
    <line x1="17" y1="4" x2="31" y2="4"/>
    <line x1="19" y1="4" x2="15" y2="12"/><line x1="29" y1="4" x2="33" y2="12"/>
    <line x1="15" y1="12" x2="21" y2="18"/><line x1="33" y1="12" x2="27" y2="18"/>
    <circle cx="24" cy="14" r="2.9"/>
    <line x1="24" y1="18" x2="24" y2="29"/>
    <line x1="24" y1="29" x2="32" y2="31"/><line x1="32" y1="31" x2="32" y2="40"/>`,
  row: `
    <circle cx="35" cy="13" r="3.2"/>
    <line x1="31" y1="15" x2="17" y2="25"/>
    <line x1="17" y1="25" x2="15" y2="40"/><line x1="17" y1="25" x2="21" y2="39"/>
    <line x1="28" y1="17" x2="26" y2="29"/>
    <line x1="21" y1="29" x2="31" y2="29"/>`,
  trxrow: `
    <line x1="30" y1="3" x2="38" y2="3"/>
    <line x1="34" y1="3" x2="25" y2="14"/>
    <circle cx="14" cy="13" r="3.2"/>
    <line x1="18" y1="16" x2="31" y2="39"/>
    <line x1="19" y1="17" x2="25" y2="14"/>
    <line x1="27" y1="41" x2="37" y2="41"/>`,
  curl: `
    <circle cx="24" cy="10" r="3.4"/>
    <line x1="24" y1="14" x2="24" y2="29"/>
    <line x1="24" y1="29" x2="20" y2="41"/><line x1="24" y1="29" x2="28" y2="41"/>
    <line x1="21" y1="16" x2="18" y2="24"/><line x1="27" y1="16" x2="30" y2="24"/>
    <line x1="18" y1="24" x2="13" y2="18"/><line x1="30" y1="24" x2="35" y2="18"/>
    <line x1="13" y1="18" x2="35" y2="18"/>`,
  skull: `
    <line x1="8" y1="36" x2="34" y2="36"/><line x1="12" y1="36" x2="12" y2="42"/><line x1="30" y1="36" x2="30" y2="42"/>
    <circle cx="11" cy="29" r="3.2"/><line x1="15" y1="29" x2="30" y2="29"/>
    <line x1="30" y1="29" x2="35" y2="33"/><line x1="35" y1="33" x2="35" y2="41"/>
    <line x1="18" y1="29" x2="18" y2="19"/><line x1="18" y1="19" x2="10" y2="15"/>
    <line x1="7" y1="11" x2="11" y2="19"/>`,
  pushdown: `
    <line x1="36" y1="3" x2="44" y2="3"/>
    <path d="M40 3 Q38 18 31 29"/>
    <circle cx="18" cy="10" r="3.3"/>
    <line x1="20" y1="14" x2="20" y2="30"/>
    <line x1="20" y1="30" x2="16" y2="41"/><line x1="20" y1="30" x2="24" y2="41"/>
    <line x1="21" y1="16" x2="26" y2="21"/><line x1="26" y1="21" x2="31" y2="29"/>`,
  dips: `
    <line x1="4" y1="24" x2="16" y2="24"/><line x1="6" y1="24" x2="6" y2="32"/><line x1="14" y1="24" x2="14" y2="32"/>
    <circle cx="24" cy="13" r="3.2"/>
    <line x1="23" y1="17" x2="24" y2="26"/>
    <line x1="24" y1="26" x2="38" y2="32"/><line x1="38" y1="32" x2="41" y2="30"/>
    <line x1="23" y1="17" x2="16" y2="24"/>`,
  squat: `
    <circle cx="19" cy="10" r="3.4"/>
    <line x1="20" y1="14" x2="17" y2="24"/>
    <line x1="17" y1="24" x2="27" y2="26"/><line x1="27" y1="26" x2="27" y2="39"/><line x1="27" y1="39" x2="32" y2="39"/>
    <line x1="20" y1="16" x2="29" y2="14"/>
    <circle cx="32" cy="14" r="2.6"/>`,
  lunge: `
    <circle cx="22" cy="8" r="3.3"/>
    <line x1="22" y1="12" x2="22" y2="24"/>
    <line x1="22" y1="24" x2="31" y2="26"/><line x1="31" y1="26" x2="31" y2="39"/>
    <line x1="22" y1="24" x2="15" y2="31"/><line x1="15" y1="31" x2="10" y2="37"/>
    <line x1="8" y1="40" x2="40" y2="40"/>`,
  stepup: `
    <line x1="26" y1="30" x2="40" y2="30"/><line x1="40" y1="30" x2="40" y2="40"/><line x1="26" y1="30" x2="26" y2="40"/>
    <line x1="6" y1="40" x2="42" y2="40"/>
    <circle cx="17" cy="8" r="3.2"/>
    <line x1="17" y1="12" x2="17" y2="22"/>
    <line x1="17" y1="22" x2="26" y2="24"/><line x1="26" y1="24" x2="27" y2="30"/>
    <line x1="17" y1="22" x2="14" y2="32"/><line x1="14" y1="32" x2="14" y2="40"/>`,
  hinge: `
    <circle cx="33" cy="14" r="3.3"/>
    <line x1="29" y1="16" x2="16" y2="24"/>
    <line x1="16" y1="24" x2="15" y2="40"/><line x1="16" y1="24" x2="20" y2="40"/>
    <line x1="27" y1="18" x2="26" y2="31"/>
    <line x1="20" y1="31" x2="32" y2="31"/>
    <line x1="20" y1="27.5" x2="20" y2="34.5"/><line x1="32" y1="27.5" x2="32" y2="34.5"/>`,
  calf: `
    <line x1="10" y1="36" x2="30" y2="36"/><line x1="30" y1="36" x2="30" y2="43"/>
    <circle cx="21" cy="8" r="3.3"/>
    <line x1="21" y1="12" x2="21" y2="25"/>
    <line x1="21" y1="25" x2="20" y2="33"/>
    <line x1="17" y1="36" x2="25" y2="32"/>
    <line x1="37" y1="22" x2="37" y2="11"/><path d="M33 15 L37 11 L41 15"/>`,
  abwheel: `
    <line x1="4" y1="40" x2="26" y2="40"/>
    <circle cx="37" cy="33" r="4.5"/>
    <line x1="6" y1="39" x2="12" y2="37"/><line x1="12" y1="37" x2="17" y2="28"/>
    <line x1="17" y1="28" x2="31" y2="20"/><circle cx="34" cy="18" r="3.1"/>
    <line x1="29" y1="21" x2="36" y2="29"/>`,
  kneeraise: `
    <line x1="11" y1="6" x2="37" y2="6"/>
    <line x1="18" y1="6" x2="22" y2="15"/><line x1="30" y1="6" x2="26" y2="15"/>
    <circle cx="24" cy="11" r="2.8"/>
    <line x1="24" y1="15" x2="24" y2="27"/>
    <line x1="24" y1="27" x2="31" y2="26"/><line x1="31" y1="26" x2="31" y2="33"/>`,
  plank: `
    <line x1="6" y1="40" x2="42" y2="40"/>
    <circle cx="10" cy="24" r="3.2"/>
    <line x1="14" y1="26" x2="36" y2="31"/>
    <line x1="16" y1="27" x2="16" y2="36"/><line x1="16" y1="36" x2="23" y2="36"/>
    <line x1="36" y1="31" x2="38" y2="38"/>`,
  rope: `
    <circle cx="24" cy="9" r="3.4"/>
    <line x1="24" y1="13" x2="24" y2="25"/>
    <line x1="24" y1="25" x2="20" y2="35"/><line x1="24" y1="25" x2="28" y2="35"/>
    <line x1="24" y1="15" x2="14" y2="20"/><line x1="24" y1="15" x2="34" y2="20"/>
    <path d="M14 20 Q24 47 34 20"/>`,
  treadmill: `
    <line x1="6" y1="39" x2="40" y2="39"/>
    <line x1="38" y1="39" x2="38" y2="20"/><line x1="34" y1="20" x2="42" y2="20"/>
    <circle cx="18" cy="12" r="3.2"/>
    <line x1="18" y1="16" x2="18" y2="26"/>
    <line x1="18" y1="26" x2="24" y2="31"/><line x1="24" y1="31" x2="23" y2="37"/>
    <line x1="18" y1="26" x2="13" y2="32"/><line x1="13" y1="32" x2="10" y2="37"/>
    <line x1="18" y1="18" x2="24" y2="21"/>`,
  weight: `
    <line x1="15" y1="24" x2="33" y2="24"/>
    <line x1="15" y1="17" x2="15" y2="31"/><line x1="11" y1="19" x2="11" y2="29"/>
    <line x1="33" y1="17" x2="33" y2="31"/><line x1="37" y1="19" x2="37" y2="29"/>`,
};

// Orden importa: la primera regla que casa gana.
const RULES = [
  [/press banca/, "bench"],
  [/inclinado/, "incline"],
  [/flexion/, "pushup"],
  [/militar|arnold|press hombro|hombro con goma/, "ohp"],
  [/lateral/, "latraise"],
  [/face ?pull/, "facepull"],
  [/dominada/, "pullup"],
  [/jalon/, "pulldown"],
  [/remo en trx/, "trxrow"],
  [/remo/, "row"],
  [/curl/, "curl"],
  [/skull|triceps ez/, "skull"],
  [/fondos/, "dips"],
  [/triceps/, "pushdown"],
  [/goblet|sentadilla/, "squat"],
  [/step-?up|escalera/, "stepup"],
  [/zancada|bulgar/, "lunge"],
  [/peso muerto/, "hinge"],
  [/gemelo/, "calf"],
  [/rueda/, "abwheel"],
  [/rodillas/, "kneeraise"],
  [/plancha/, "plank"],
  [/comba/, "rope"],
  [/cinta/, "treadmill"],
];

export function exerciseIcon(name) {
  const n = norm(name);
  let key = "weight";
  for (const [re, k] of RULES) {
    if (re.test(n)) { key = k; break; }
  }
  const span = document.createElement("span");
  span.className = "ex-ico";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" ` +
    `stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`;
  return span;
}
