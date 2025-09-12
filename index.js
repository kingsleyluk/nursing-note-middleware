import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Middleware server is running" });
});

// Helper function to call OpenAI
async function callOpenAI(model, nursingNote) {
  const prompt = `
You are a professional clinical documentation assistant.
Rewrite the following nursing note into a clean, concise, professional format.

Rules:
- Keep nursing shorthand exactly as written (e.g., BO ×1, NBM, SpO₂, Pt, C/O).
- Maintain all vitals, times, meds, and interventions.
- Use headings: CNS, CVS, RESP, Endocrine, Hydration/Nutrition, GIT, Renal, Wounds, Integument, Mobility, Plan/Other.
- Only include headings that have data (omit empty ones).
- Do not add information not present in the original note.
- Output must follow heading format exactly as shown above.

Original Note:
${nursingNote}
  `;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: prompt }],
      temperature: 0.2, // keeps output consistent and stable
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorBody}`);
  }

  return response.json();
}

app.post("/polish", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing." });
    }

    const nursingNote = req.body.nursing_note;
    if (!nursingNote) {
      return res.status(400).json({ error: "Missing nursing_note in request body" });
    }

    console.log("🟡 RAW NOTE:", nursingNote);

    let data;
    let modelUsed = "gpt-4o-mini";

    try {
      data = await callOpenAI("gpt-4o-mini", nursingNote);
    } catch (err) {
      console.error("⚠️ gpt-4o-mini failed, falling back to gpt-3.5-turbo:", err.message);
      modelUsed = "gpt-3.5-turbo";

      try {
        data = await callOpenAI("gpt-3.5-turbo", nursingNote);
      } catch (fallbackErr) {
        console.error("❌ Fallback model also failed:", fallbackErr.message);
        console.warn("Returning raw note as fallback to avoid blocking Base44.");
        return res.json({ polished_note: nursingNote, model_used: "raw_fallback" });
      }
    }

    if (!data.choices || !data.choices.length) {
      console.warn("⚠️ OpenAI returned no choices. Returning raw note.");
      return res.json({ polished_note: nursingNote, model_used: "raw_fallback" });
    }

    const polishedNote = data.choices[0].message.content.trim();
    console.log("🟢 POLISHED NOTE:", polishedNote);

    res.json({
      polished_note: polishedNote,
      model_used: modelUsed,
    });
  } catch (error) {
    console.error("❌ Unhandled error:", error.message || error);
    // Final fallback: return raw note so Base44 isn't blocked
    res.json({ polished_note: req.body.nursing_note, model_used: "raw_fallback" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Middleware server running on port ${PORT}`));
