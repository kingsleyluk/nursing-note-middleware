import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/polish", async (req, res) => {
  try {
    const nursingNote = req.body.nursing_note;

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

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "system", content: prompt }]
      })
    });

    const data = await openaiResponse.json();
    res.json({ polished_note: data.choices[0].message.content });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to polish note" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Middleware server running on port ${PORT}`));
