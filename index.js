import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Middleware server is running" });
});

// Helper function to call OpenAI API
async function callOpenAI(model, nursingNote) {
  const prompt = `
You are a professional clinical documentation assistant.

Rewrite the following nursing note into a structured clinical note with the following body system headings:
- CNS
- CVS
- RESP
- Endocrine
- Hydration/Nutrition
- GIT
- Renal
- Wounds
- Integument
- Mobility
- Plan/Other (only if there are follow-up actions or plans)

Rules:
- Include ONLY the headings that have information in the note — do not add empty headings.
- Write each section on a new line starting with the heading and a colon.
- Use clear, professional, third-person, past-tense language.
- Keep all medications, doses, times, vital signs, and interventions exactly as written.
- Use concise sentences and correct nursing terminology.
- Do NOT invent or add new information not present in the original note.

Original Note:
${nursingNote}

Return ONLY the formatted note like this example:
CNS: Pt alert & orientated. Nil C/O pain this shift.
CVS: Obs stable and within normal parameters this shift. Maintained on room air.
...
Plan/Other: Rehab scheduled for tomorrow.
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
      return res.status(500).json({ error: "OPENAI_API_KEY is missing. Set it in Railway variables." });
    }

    const nursingNote = req.body.nursing_note;
    if (!nursingNote) {
      return res.status(400).json({ error: "Missing nursing_note in request body" });
    }

    let data;
    let modelUsed = "gpt-4o-mini";

    try {
      // First try gpt-4o-mini
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
