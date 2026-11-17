/* ===== J.A.R.V.I.S. · Lógica del frontend ===== */

const core   = document.getElementById("core");
const status = document.getElementById("status");
const log    = document.getElementById("log");
const input  = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");

const STATES = {
  idle:     { cls: "idle",     text: "SISTEMA EN ESPERA" },
  thinking: { cls: "thinking", text: "PROCESANDO..." },
  speaking: { cls: "speaking", text: "TRANSMITIENDO" },
};

// Historial corto para que Jarvis recuerde el contexto (formato Gemini)
const history = [];
let busy = false;

/* ---------- Estado visual del núcleo ---------- */
function setState(name) {
  core.className = "core " + STATES[name].cls;
  status.textContent = STATES[name].text;
}

/* ---------- Registro de conversación ---------- */
function addMsg(kind, who, text) {
  const div = document.createElement("div");
  div.className = "msg " + kind;
  const label = document.createElement("span");
  label.className = "who";
  label.textContent = "> " + who;
  div.append(label, document.createTextNode(text)); // textContent: evita inyección HTML
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

/* ---------- Envío al backend ---------- */
async function sendMessage(text) {
  text = text.trim();
  if (!text || busy) return;

  busy = true;
  sendBtn.disabled = true;
  speechSynthesis.cancel();          // corta cualquier locución anterior
  addMsg("user", "USUARIO", text);
  input.value = "";
  setState("thinking");

  try {
    const res = await fetch("/.netlify/functions/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error de comunicación");

    history.push({ role: "user",  parts: [{ text }] });
    history.push({ role: "model", parts: [{ text: data.reply }] });
    if (history.length > 12) history.splice(0, 2);   // máx. 6 turnos

    addMsg("bot", "J.A.R.V.I.S.", data.reply);
    speak(data.reply);
  } catch (err) {
    addMsg("err", "ERROR", err.message);
    setState("idle");
  } finally {
    busy = false;
    sendBtn.disabled = false;
  }
}

/* ---------- Síntesis de voz ---------- */
let voices = [];
function loadVoices() { voices = speechSynthesis.getVoices(); }
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;   // Chrome las carga de forma asíncrona

function speak(text) {
  // Quita restos de markdown para que el sintetizador no los lea
  const clean = text.replace(/[*_#`>~|]/g, "").replace(/\s+/g, " ");
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "es-ES";
  u.voice = voices.find(v => v.lang === "es-ES") || voices.find(v => v.lang.startsWith("es")) || null;
  u.rate = 0.97;
  u.pitch = 0.85;                       // tono algo más grave

  u.onstart = () => setState("speaking");
  u.onend   = () => setState("idle");   // vuelve a espera al terminar
  u.onerror = () => setState("idle");
  speechSynthesis.speak(u);
}

/* ---------- Reconocimiento de voz ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SR) {
  recognition = new SR();
  recognition.lang = "es-ES";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart  = () => micBtn.classList.add("listening");
  recognition.onend    = () => micBtn.classList.remove("listening");
  recognition.onresult = (e) => sendMessage(e.results[0][0].transcript);
  recognition.onerror  = (e) => {
    micBtn.classList.remove("listening");
    if (e.error === "not-allowed") addMsg("err", "ERROR", "Permiso de micrófono denegado.");
    else if (e.error !== "no-speech" && e.error !== "aborted") addMsg("err", "ERROR", "Fallo de reconocimiento: " + e.error);
  };

  micBtn.addEventListener("click", () => {
    speechSynthesis.cancel();
    setState("idle");
    try { recognition.start(); } catch { recognition.stop(); }
  });
} else {
  micBtn.disabled = true;
  micBtn.title = "Tu navegador no admite reconocimiento de voz (usa Chrome o Edge)";
}

/* ---------- Eventos de texto ---------- */
sendBtn.addEventListener("click", () => sendMessage(input.value));
input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(input.value); });

/* ---------- Saludo inicial ---------- */
addMsg("bot", "J.A.R.V.I.S.", "Sistemas en línea. A su disposición, profesor. Alumnos, sean amables: yo no me canso, pero la curiosidad sí debería.");
setState("idle");
