/**
- Netlify Function: /.netlify/functions/jarvis
- Recibe { message, history } y devuelve { reply } consultando a Gemini.
- La API key vive SOLO en las variables de entorno de Netlify (GEMINI_API_KEY).
 */

const MODEL = "gemini-3.8-flash";

const SYSTEM_PROMPT =
  "Eres J.A.R.V.I.S., el asistente de inteligencia artificial avanzado. Estás operando en un aula de secundaria. " +
  "Dirígete al profesor o a los alumnos con extrema educación, elegancia, brillantez técnica y un sutil toque de ironía y humor británico. " +
  "Tus respuestas deben ser concisas (máximo 2 o 3 párrafos cortos) porque van a ser leídas en voz alta por un sintetizador de voz; " +
  "no uses formato markdown complejo (como tablas o asteriscos) que suene mal al leerse. " +
  "Tu objetivo es pedagógico: si un alumno te hace una pregunta académica, no le des la respuesta masticada; " +
  "dale una pista brillante, hazle razonar y fomenta su curiosidad científica.";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Método no permitido" });

  const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
  if (!apiKey) return json(500, { error: "Falta GEMINI_API_KEY en la configuración del servidor." });

  let message, history;
  try {
    ({ message, history = [] } = JSON.parse(event.body || "{}"));
  } catch {
    return json(400, { error: "Petición mal formada" });
  }
  if (typeof message !== "string" || !message.trim()) return json(400, { error: "Mensaje vacío" });
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
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return json(502, { error: `Respuesta inesperada (${res.status}): ${rawText.slice(0, 120)}` });
    }

    if (!res.ok) {
      return json(502, { error: data.error?.message || "La API de Gemini devolvió un error." });
    }

    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("").trim();
    if (!reply) return json(200, { reply: "Mis disculpas: no he podido formular una respuesta adecuada. ¿Podría reformular la pregunta?" });

    return json(200, { reply });
  } catch (err) {
    console.error("Error de red:", err);
    return json(500, { error: "Fallo al conectar con el núcleo de J.A.R.V.I.S." });
  }
};
