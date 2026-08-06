// ============================================================================
// Perfil activo · quién está usando la app ahora mismo (sin login)
// ============================================================================
// La app la usan dos personas desde la misma URL y la misma base de datos.
// La separación de datos es de capa de aplicación: db.js filtra TODAS las
// consultas por-persona con el id que guarda este módulo, así el filtro vive
// en un solo sitio y ningún llamador puede olvidarlo.
//
// Sin dependencias a propósito: db.js lo importa, así que este módulo no puede
// importar db.js (sería un ciclo).
// ============================================================================

const KEY = "ft_active_profile";

let profiles = [];   // lista completa, para pintar el selector
let activeId = null; // se resuelve en el arranque (app.js)

export function getActiveProfileId() {
  return activeId;
}

export function setActiveProfileId(id) {
  activeId = id || null;
  try {
    if (activeId) localStorage.setItem(KEY, activeId);
    else localStorage.removeItem(KEY);
  } catch { /* modo privado / almacenamiento lleno: seguimos en memoria */ }
}

export function getProfiles() {
  return profiles;
}

export function getActiveProfile() {
  return profiles.find((p) => p.id === activeId) || null;
}

// Fija la lista y elige el perfil activo: el guardado si sigue existiendo,
// si no el primero. Devuelve el perfil elegido (o null si no hay ninguno).
export function resolveActive(list) {
  profiles = Array.isArray(list) ? list : [];
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* sin localStorage */ }

  // Sin lista (p.ej. fallo de red al arrancar) conservamos el id guardado en
  // memoria: mejor seguir con el perfil de la última sesión que con ninguno.
  if (!profiles.length) {
    activeId = stored || null;
    return null;
  }

  const found = profiles.find((p) => p.id === stored);
  setActiveProfileId(found ? found.id : profiles[0].id);
  return getActiveProfile();
}
