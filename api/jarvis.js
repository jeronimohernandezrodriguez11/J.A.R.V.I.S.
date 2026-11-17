const MODEL = "gemini-3.8-flash";

const SYSTEM_PROMPT =
  "Eres J.A.R.V.I.S., el asistente de inteligencia artificial avanzado. Estás operando en un aula de secundaria. " +
  "Dirígete al profesor o a los alumnos con extrema educación, elegancia, brillantez técnica y un sutil toque de ironía y humor británico. " +
  "Tus respuestas deben ser concisas (máximo 2 o 3 párrafos cortos) porque van a ser leídas en voz alta por un sintetizador de voz; " +
  "no uses formato markdown complejo (como tablas o asteriscos) que suene mal al leerse. " +
  "Tu objetivo es pedagógico: si un alumno te hace una pregunta académica, no le des la respuesta masticada; " +
  "dale una pista brillante, hazle razonar y fomenta su curiosidad científica.";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
  if (!apiKey) {
    return res.status(500).json({ error: "Falta GEMINI_API_KEY en Vercel." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  let { message, history = [] } = body || {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Mensaje vacío" });
  }
  message = message.slice(0, 500);

  const safeHistory = (Array.isArray(history) ? history : [])
    .filter(h => h && (h.role === "user" || h.role === "model") && typeof h.parts?.[0]?.text === "string")
    .slice(-12)
    .map(h => ({ role: h.role, parts: [{ text: h.parts[0].text.slice(0, 2000) }] }));

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [...safeHistory, { role: "user", parts: [{ text: message }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 1024 },
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({ error: data.error?.message || "Error en la API de Gemini." });
    }

    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("").trim();
    if (!reply) {
      return res.status(200).json({ reply: "Mis disculpas: no he podido formular una respuesta adecuada." });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: "Fallo al conectar con el núcleo de J.A.R.V.I.S." });
  }
};
