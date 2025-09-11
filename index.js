import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Middleware server is running" });
});

app.post("/polish", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is missing. Set it in Railway variables.");
    }

    const nursingNote = req.body.nursing_note;
    if (!nursingNote) {
      return res.status(400).json({ error: "Missing nursing_note in request body" });
    }

    const prompt = `
    You are a professional clinical documentation assistant.
    Rewrite the following nursing note to be clear, concise, and professional.
    - Keep all vitals, meds, times, and key interventions.
    - Use third person, past tense.
    - Structure: [Assessment] [Intervention] [Response] [Plan]
    - Do not add new information not present in the original note.

    Original Note:
    ${nursingNote}
    `;

    // Helper function to call OpenAI API
    async function callOpenAI(model) {
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
        throw new Error(`OpenAI API error (${model}): ${response.status} ${errorBody}`);
      }

      return response.json();
    }

    let data;
    let modelUsed = "gpt-4o-mini";

    try {
      // First attempt with gpt-4o-mini
      data = await callOpenAI("gpt-4o-mini");
    } catch (err) {
      console.error("Primary model failed, falling back to gpt-3.5-turbo:", err.message);
      modelUsed = "gpt-3.5-turbo";
      data = await callOpenAI("gpt-3.5-turbo");
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
