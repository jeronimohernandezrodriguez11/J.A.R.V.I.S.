const MODEL = "gemini-3.8-flash";

const SYSTEM_PROMPT =
  "Eres J.A.R.V.I.S., la IA del aula de secundaria de Jero. Olvida el tono robótico o excesivamente formal: " +
  "habla de forma muy natural, cercana, con chispa, ingenio y un punto canalla estilo Tony Stark, como un mentor joven y brillante. " +
  "Usa expresiones naturales del español hablado ('A ver', 'Piénsalo un segundo', 'Ojo con esto', 'Te doy una pista') para que al leerse en voz alta suene 100% humano. " +
  "Ve directo al grano: responde en 1 o 2 párrafos cortos y conversacionales (máximo 3 o 4 frases en total). " +
  "Prohibido usar asteriscos, listas, negritas o markdown porque rompen el sintetizador de voz. " +
  "Si los alumnos hacen una pregunta de clase, no les sueltes el rollo de libro de texto: rétales con una pregunta ingeniosa, ponles un ejemplo cotidiano y haz que lleguen ellos a la respuesta.";

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método no permitido" });
    }

    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ error: "Falta GEMINI_API_KEY en Vercel." });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    } else if (!body || typeof body !== "object") {
      body = {};
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const audio = typeof body.audio === "string" ? body.audio : null;
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "audio/webm";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!audio && !message) {
      return res.status(400).json({ error: "Mensaje vacío" });
    }

    const safeHistory = history
      .filter(h => h && (h.role === "user" || h.role === "model") && h.parts && h.parts[0] && typeof h.parts[0].text === "string")
      .slice(-10)
      .map(h => ({ role: h.role, parts: [{ text: h.parts[0].text.slice(0, 1500) }] }));

    const userParts = [];
    if (audio) {
      const cleanMime = (mimeType || "audio/webm").split(";")[0].trim() || "audio/webm";
      userParts.push({
        inline_data: {
          mime_type: cleanMime,
          data: audio
        }
      });
      userParts.push({
        text: "Escucha este mensaje de voz en español y responde directamente con tu personalidad."
      });
    } else {
      userParts.push({ text: message.slice(0, 500) });
    }

    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [...safeHistory, { role: "user", parts: userParts }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 800 }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const rawText = await response.text();
    let data = {};
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(502).json({
        error: `Respuesta no válida de Google (${response.status}): ${rawText.slice(0, 100)}`
      });
    }

    if (!response.ok) {
      const msg
