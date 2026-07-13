// ============================================================================
// Vista: Login (código OTP por email) — pantalla completa, gate de la app.
// ============================================================================

import { el, clear, toast, showError } from "../utils.js";
import { sendCode, verifyCode } from "../auth.js";

// Renderiza el gate en `host`. `onSuccess` se llama al iniciar sesión.
export function renderLogin(host, onSuccess) {
  clear(host);
  let email = "";

  const wrap = el("div", { class: "login" });
  const card = el("div", { class: "card login__card" });
  card.append(el("div", { class: "login__brand" }, "🏋 Fitness Tracker"));
  card.append(el("p", { class: "muted login__intro" },
    "App privada. Introduce tu email y te enviaremos un código de acceso."));

  // ---- Paso 1: email -------------------------------------------------------
  const stepEmail = el("form", { class: "login__step" });
  const emailInput = el("input", {
    type: "email", placeholder: "tu@email.com", autocomplete: "email",
    inputmode: "email", required: true,
  });
  const sendBtn = el("button", { type: "submit", class: "btn btn--primary field--wide" }, "Enviar código");
  stepEmail.append(
    el("label", { class: "field field--wide" }, [el("span", {}, "Email"), emailInput]),
    sendBtn
  );

  // ---- Paso 2: código ------------------------------------------------------
  const stepCode = el("form", { class: "login__step", style: "display:none" });
  const codeInfo = el("p", { class: "muted" }, "");
  const codeInput = el("input", {
    type: "text", placeholder: "123456", inputmode: "numeric",
    autocomplete: "one-time-code", maxlength: "6", class: "login__code",
  });
  const verifyBtn = el("button", { type: "submit", class: "btn btn--primary field--wide" }, "Entrar");
  const backBtn = el("button", { type: "button", class: "btn btn--ghost field--wide" }, "← Cambiar email");
  stepCode.append(
    codeInfo,
    el("label", { class: "field field--wide" }, [el("span", {}, "Código de 6 dígitos"), codeInput]),
    verifyBtn,
    backBtn
  );

  card.append(stepEmail, stepCode);
  wrap.append(card);
  host.append(wrap);

  // ---- Lógica --------------------------------------------------------------
  stepEmail.addEventListener("submit", async (e) => {
    e.preventDefault();
    email = emailInput.value.trim();
    if (!email) return;
    sendBtn.disabled = true;
    sendBtn.textContent = "Enviando…";
    try {
      await sendCode(email);
      codeInfo.textContent = `Código enviado a ${email}. Revisa tu correo (y spam).`;
      stepEmail.style.display = "none";
      stepCode.style.display = "";
      codeInput.focus();
    } catch (err) {
      showError(err);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Enviar código";
    }
  });

  backBtn.addEventListener("click", () => {
    stepCode.style.display = "none";
    stepEmail.style.display = "";
    codeInput.value = "";
  });

  stepCode.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = codeInput.value.trim();
    if (token.length < 6) return toast("El código tiene 6 dígitos", "err");
    verifyBtn.disabled = true;
    verifyBtn.textContent = "Comprobando…";
    try {
      await verifyCode(email, token);
      toast("Sesión iniciada");
      onSuccess?.();
    } catch (err) {
      showError(err);
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Entrar";
    }
  });
}
