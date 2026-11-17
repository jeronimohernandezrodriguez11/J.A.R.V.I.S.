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
    const res = await fetch("/api/jarvis", {
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

// --- 5. RECONOCIMIENTO DE VOZ (MICRÓFONO BLINDADO) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.continuous = false;
  recognition.interimResults = true; // Muestra lo que hablas en tiempo real
  recognition.maxAlternatives = 1;

  let isListening = false;
  let finalTranscript = "";

  micBtn.addEventListener("click", () => {
    window.speechSynthesis.cancel();

    if (isListening) {
      recognition.stop();
      return;
    }

    finalTranscript = "";
    userInput.value = "";
    try {
      recognition.start();
    } catch (err) {
      recognition.stop();
    }
  });

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add("active");
    setState("listening", "ESCUCHANDO... HABLA AHORA");
  };

  recognition.onresult = (e) => {
    let interimTranscript = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const piece = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalTranscript += piece;
      } else {
        interimTranscript += piece;
      }
    }
    // Ves en la barra de texto lo que Jarvis está entendiendo en vivo
    userInput.value = (finalTranscript || interimTranscript).trim();
  };

  recognition.onerror = (e) => {
    isListening = false;
    micBtn.classList.remove("active");
    const errores = {
      "not-allowed": "PERMISO DE MICRÓFONO DENEGADO EN EL NAVEGADOR",
      "no-speech": "NO SE DETECTÓ VOZ — INTÉNTALO DE NUEVO",
      "audio-capture": "NO SE DETECTA NINGÚN MICRÓFONO CONECTADO",
      "network": "ERROR DE RED EN EL SERVICIO DE VOZ (USA CHROME O EDGE)"
    };
    setState("idle", errores[e.error] || `ERROR DE MICRO: ${e.error.toUpperCase()}`);
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove("active");
    const textToSend = userInput.value.trim();
    if (textToSend) {
      sendMessage(textToSend);
    } else if (core.getAttribute("data-state") === "listening") {
      setState("idle", "SISTEMA EN LÍNEA — ESPERANDO ÓRDENES");
    }
  };
} else {
  micBtn.addEventListener("click", () => {
    setState("idle", "ESTE NAVEGADOR NO SOPORTA VOZ — ABRE CHROME O EDGE");
  });
}
