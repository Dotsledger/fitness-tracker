// ============================================================================
// Autenticación · Supabase Auth con código OTP por email (sin contraseña)
// ============================================================================
// Flujo: el usuario escribe su email → recibe un código de 6 dígitos →
// lo introduce → sesión iniciada (persistida en localStorage). No hay
// contraseñas ni magic-links con redirect. Los datos quedan bloqueados por
// RLS a la cuenta autorizada (ver db/schema.sql, política por email).
// ============================================================================

import { sb } from "./db.js";

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

export async function getUser() {
  const { data } = await sb.auth.getUser();
  return data?.user || null;
}

// Envía el código OTP al email. shouldCreateUser crea la cuenta la 1ª vez.
export async function sendCode(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

// Verifica el código de 6 dígitos y abre sesión.
export async function verifyCode(email, token) {
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await sb.auth.signOut();
}

// Notifica cambios de sesión (login/logout). Devuelve la función para desuscribir.
export function onAuthChange(cb) {
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
