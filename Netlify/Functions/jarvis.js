/**
 * Netlify Function: /.netlify/functions/jarvis
 * Recibe { message, history } y devuelve { reply } consultando a Gemini.
 * La API key vive SOLO en las variables de entorno de Netlify (GEMINI_API_KEY).
 */

// El modelo se puede cambiar desde Netlify sin tocar el código (variable GEMINI_MODEL)
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(500, { error: "Falta GEMINI_API_KEY en la configuración del servidor." });

  // --- Validación de entrada ---
  let message, history;
  try {
    ({ message, history = [] } = JSON.parse(event.body || "{}"));
  } catch {
    return json(400, { error: "Petición mal formada" });
  }
  if (typeof message !== "string" || !message.trim()) return json(400, { error: "Mensaje vacío" });
  message = message.slice(0, 500);

  // Solo aceptamos historial con la forma esperada y limitado a 12 mensajes
  const safeHistory = (Array.isArray(history) ? history : [])
    .filter(h => h && (h.role === "user" || h.role === "model") && typeof h.parts?.[0]?.text === "string")
    .slice(-12)
    .map(h => ({ role: h.role, parts: [{ text: h.parts[0].text.slice(0, 2000) }] }));

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [...safeHistory, { role: "user", parts: [{ text: message }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 1024 },
  };

  // --- Llamada a la API REST de Gemini ---
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();

    if (!res.ok) {
      console.error("Error Gemini:", JSON.stringify(data));
      return json(502, { error: data.error?.message || "La API de Gemini devolvió un error." });
    }

    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("").trim();
    if (!reply) return json(200, { reply: "Mis disculpas: no he podido formular una respuesta adecuada. ¿Podría reformular la pregunta?" });

    return json(200, { reply });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Fallo interno al contactar con Gemini." });
  }
};
