const core = document.getElementById("core");
const statusText = document.getElementById("statusText");
const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const micBtn = document.getElementById("micBtn");
const muteBtn = document.getElementById("muteBtn");
const voiceSelect = document.getElementById("voiceSelect");
const memStat = document.getElementById("memStat");
const pingStat = document.getElementById("pingStat");
const visualizerBars = document.querySelectorAll("#visualizer i");

let history = [];
let isMuted = false;
let selectedVoice = null;

// --- 1. SELECTOR DE VOCES NATURALES ---
function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  const allVoices = window.speechSynthesis.getVoices();
  const esVoices = allVoices.filter(v => v.lang.toLowerCase().startsWith("es"));
  if (!esVoices.length) return;

  esVoices.sort((a, b) => {
    const score = (v) => {
      const n = v.name.toLowerCase();
      if (n.includes("natural") || n.includes("online")) return 4;
      if (n.includes("google") || n.includes("alvaro") || n.includes("jorge") || n.includes("pablo")) return 3;
      if (n.includes("premium") || n.includes("enhanced")) return 2;
      return 1;
    };
    return score(b) - score(a);
  });

  if (voiceSelect) {
    voiceSelect.innerHTML = "";
    esVoices.forEach((v, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `${v.name.replace(/Microsoft |Google /g, "")} (${v.lang})`;
      voiceSelect.appendChild(opt);
    });
    voiceSelect.onchange = () => {
      selectedVoice = esVoices[voiceSelect.value];
    };
  }
  selectedVoice = esVoices[0];
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

// --- 2. SÍNTESIS DE VOZ ---
function speak(text) {
  if (isMuted || !("speechSynthesis" in window)) {
    setState("idle", "SISTEMA EN LÍNEA — ESPERANDO ÓRDENES");
    return;
  }
  window.speechSynthesis.cancel();

  const cleanText = text.replace(/[*_#`~]/g, "").trim();
  const sentences = cleanText.match(/[^.!?]+[.!?]*/g) || [cleanText];

  setState("speaking", "TRANSMITIENDO AUDIO...");

  sentences.forEach((sentence, idx) => {
    const utter = new SpeechSynthesisUtterance(sentence.trim());
    if (selectedVoice) utter.voice = selectedVoice;
    utter.lang = selectedVoice?.lang || "es-ES";
    utter.rate = 1.05;
    utter.pitch = 0.96;

    if (idx === sentences.length - 1) {
      utter.onend = () => setState("idle", "SISTEMA EN LÍNEA — ESPERANDO ÓRDENES");
      utter.onerror = () => setState("idle", "SISTEMA EN LÍNEA — ESPERANDO ÓRDENES");
    }
    window.speechSynthesis.speak(utter);
  });
}

// --- 3. INTERFAZ Y ESTADO ---
function setState(state, label) {
  if (core) core.setAttribute("data-state", state);
  if (statusText) statusText.textContent = label;
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role === "user" ? "user" : "jarvis"}`;
  div.innerHTML = `<span class="msg-tag">${role === "user" ? "OPERADOR (AULA)" : "J.A.R.V.I.S."}</span><p></p>`;
  div.querySelector("p").textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// --- 4. ENVÍO DE TEXTO O AUDIO A GEMINI ---
async function sendToJarvis({ text = "", audio = null, mimeType = "" }) {
  if (!audio && !text.trim()) return;

  appendMessage("user", audio ? "🎙️ [Mensaje de voz transmitido]" : text);
  userInput.value = "";
  setState("thinking", "PROCESANDO EN EL NÚCLEO...");

  const t0 = performance.now();
  try {
    const res = await fetch("/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, audio, mimeType, history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error de comunicación");

    if (pingStat) pingStat.textContent = `${Math.round(performance.now() - t0)} ms`;

    history.push({ role: "user", parts: [{ text: audio ? "(Mensaje de voz)" : text }] });
    history.push({ role: "model", parts: [{ text: data.reply }] });
    if (history.length > 12) history = history.slice(-12);
    if (memStat) memStat.textContent = `${history.length} / 12 Nodos`;

    appendMessage("jarvis", data.reply);
    speak(data.reply);
  } catch (err) {
    setState("idle", "ERROR DE ENLACE");
    appendMessage("jarvis", `Fallo en los sensores: ${err.message}`);
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendToJarvis({ text: userInput.value });
});

if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    isMuted = !isMuted;
    if (isMuted && "speechSynthesis" in window) window.speechSynthesis.cancel();
    muteBtn.textContent = isMuted ? "🔇 SILENCIADO" : "🔊 VOZ ACTIVA";
  });
}

// --- 5. GRABACIÓN DE MICRO DIRECTA A GEMINI (UNIVERSAL) ---
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioContext = null;
let animFrame = null;
let silenceTimer = null;

function stopVisualizer() {
  if (animFrame) cancelAnimationFrame(animFrame);
  if (silenceTimer) clearTimeout(silenceTimer);
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  visualizerBars.forEach(bar => (bar.style.height = "8px"));
}

async function toggleMic() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  // Si ya está grabando, al pulsar otra vez enviamos el audio
  if (isRecording && mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    audioChunks = [];
    isRecording = true;

    micBtn.classList.add("active");
    setState("listening", "ESCUCHANDO... (PULSA 🎙️ O HAZ UNA PAUSA PARA ENVIAR)");

    // Visualizador de ondas en tiempo real y detector de pausa
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    let hasSpoken = false;
    function renderWave() {
      if (!isRecording) return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      visualizerBars.forEach((bar, i) => {
        const val = dataArray[i * 2] || avg;
        bar.style.height = `${Math.max(6, Math.min(34, (val / 255) * 38))}px`;
      });

      if (avg > 18) {
        hasSpoken = true;
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      } else if (hasSpoken && !silenceTimer) {
        // Si ya hablaste y haces 1.6s de silencio, envía solo
        silenceTimer = setTimeout(() => {
          if (isRecording && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
          }
        }, 1600);
      }
      animFrame = requestAnimationFrame(renderWave);
    }
    renderWave();

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      isRecording = false;
      micBtn.classList.remove("active");
      stopVisualizer();
      stream.getTracks().forEach(t => t.stop());

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      if (blob.size < 800) {
        setState("idle", "NO SE DETECTÓ AUDIO — INTÉNTALO DE NUEVO");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result.split(",")[1];
        sendToJarvis({ audio: base64Audio, mimeType: blob.type });
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();
  } catch (err) {
    isRecording = false;
    micBtn.classList.remove("active");
    stopVisualizer();
    setState("idle", "PERMISO DE MICRÓFONO BLOQUEADO — REVISA EL CANDADO DE LA URL");
  }
}

micBtn.addEventListener("click", toggleMic);
