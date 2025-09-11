import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Middleware server is running" });
});

// Helper function to call OpenAI API with a specific model
async function callOpenAI(model, nursingNote) {
  const prompt = `
You are a professional clinical documentation assistant.
Rewrite the following nursing note into a clear, concise, and professional format.

Requirements:
- Use the following section headings **only if data exists in the note**:
  CNS, CVS, RESP, Endocrine, Hydration/Nutrition, GIT, Renal, Wounds, Integument, Mobility, Plan/Other.
- Do NOT invent or add data that is not present in the original note.
- Write in third person, past tense.
- Keep all vitals, meds, times, and interventions.
- Each heading should be on a new line followed by a colon and its content.

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
      model: model,
      messages: [{ role: "system", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorBody}`);
  }

  return response.json();
}

// Main polish endpoint
app.post("/polish", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is missing. Set it in Railway variables.");
    }

    const nursingNote = req.body.nursing_note;
    if (!nursingNote) {
      return res.status(400).json({ error: "Missing nursing_note in request body" });
    }

    let data;
    let modelUsed = "gpt-4o-mini";

    try {
      // First attempt with gpt-4o-mini
      data = await callOpenAI("gpt-4o-mini", nursingNote);
    } catch (err) {
      console.error("Primary model failed, falling back to gpt-3.5-turbo:", err.message);
      modelUsed = "gpt-3.5-turbo";
      data = await callOpenAI("gpt-3.5-turbo", nursingNote);
    }

    if (!data.choices || !data.choices.length) {
      throw new Error("OpenAI API returned no choices");
    }

    res.json({
      polished_note: data.choices[0].message.content,
      model_used: modelUsed,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message || "Failed to polish note" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Middleware server running on port ${PORT}`));
