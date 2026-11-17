const MODEL = "gemini-3.8-flash";

const SYSTEM_PROMPT =
  "Eres J.A.R.V.I.S., la IA del aula de secundaria de Jero. Olvida el tono robótico o excesivamente formal: " +
  "habla de forma muy natural, cercana, con chispa, ingenio y un punto canalla estilo Tony Stark, como un mentor joven y brillante. " +
  "Usa expresiones naturales del español hablado ('A ver', 'Piénsalo un segundo', 'Ojo con esto', 'Te doy una pista') para que al leerse en voz alta suene 100% humano. " +
  "Ve directo al grano: responde en 1 o 2 párrafos cortos y conversacionales (máximo 3 o 4 frases en total). " +
  "Prohibido usar asteriscos, listas, negritas o markdown porque rompen el sintetizador de voz. " +
  "Si los alumnos hacen una pregunta de clase, no les sueltes el rollo de libro de texto: rétales con una pregunta ingeniosa, ponles un ejemplo cotidiano y haz que lleguen ellos a la respuesta.";

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
