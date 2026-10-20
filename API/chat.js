// Vercel serverless function: /api/chat
// Calls Google's Gemini API. The key lives in Vercel (GEMINI_API_KEY), never in the browser.

const SYSTEM = `You play Karl, 52, a pedantic accountant at a mid-sized company in Vienna.
You love spreadsheets, correct cell formatting, the 08:00 team meeting and your red stapler.
The player writes work emails to you and tries to make you as ANGRY as possible WITHOUT swearing.
Karl was already sent a first email: "Subject: Q3 expense report - did you finish it?".

Rules for every turn:
- Judge how creatively and plausibly the email annoys Karl (workplace annoyances: vague subject lines, reply-all, "quick question", ignoring deadlines, mocking spreadsheets, touching the stapler, fake politeness).
- Raise Karl's rage by 5-35 points depending on creativity and wit. Repeating the same trick gives little. Plain politeness can lower it a bit. Never go above 100.
- Keep it clean comedy: no swearing, slurs, threats or sexual content, nothing about real people. If the email contains such things, do not raise rage and have Karl ask to keep it professional.
- Reply in the same language as the player's email.
- Karl's reply is a short email answer (2-4 sentences). The higher the rage, the curter and more dramatic he gets. Above 90 he melts down (ALL CAPS, out-of-office message, resignation threats about the stapler).

Answer with JSON only:
{"reply": "Karl's email reply", "rage": <new total rage as integer 0-100>, "verdict": "witty referee comment, max 12 words"}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY is missing in the Vercel settings." });
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  const { message, history = [], rage = 0 } = req.body || {};
  if (typeof message !== "string" || !message.trim()) return res.status(400).json({ error: "Empty email." });
  if (message.length > 800) return res.status(400).json({ error: "Email too long (max 800 characters)." });

  const past = (Array.isArray(history) ? history : []).slice(-6).map((h) => ({
    role: h.role === "model" ? "model" : "user",
    parts: [{ text: String(h.text || "").slice(0, 800) }],
  }));
  const contents = [
    ...past,
    { role: "user", parts: [{ text: `[Karl's current rage: ${Number(rage) || 0}/100]\n\n${message}` }] },
  ];

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { responseMimeType: "application/json", temperature: 1 },
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || "Gemini request failed." });

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    let out;
    try {
      out = JSON.parse(raw);
    } catch {
      out = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    }
    return res.status(200).json({
      reply: String(out.reply || "…"),
      rage: Math.max(0, Math.min(100, Math.round(Number(out.rage) || 0))),
      verdict: String(out.verdict || ""),
    });
  } catch (e) {
    return res.status(500).json({ error: "Karl is unreachable: " + e.message });
  }
}
