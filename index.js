import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

// ✅ Enable CORS for all origins (safe for testing)
app.use(cors({
  origin: "*", // or replace with "https://your-base44-app-domain" for more security
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"],
}));

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Middleware server is running" });
});

// Helper: apply PICC line formatting
function applyPICCFormatting(note) {
  if (!note) return note;

  return note.replace(
    /PICC.*?(?:in[-\s]?situ)?.*?(?:\n|$)/gi,
    (match) => {
      // Try to extract lumens count (1, 2, 3...) if mentioned
      const lumenMatch = match.match(/(\d+)\s*lumens?/i);
      const lumens = lumenMatch ? `X${lumenMatch[1]} lumens` : "";

      // Extract any free text after lumens
      let details = match
        .replace(/PICC.*?(in[-\s]?situ)?/i, "")
        .replace(/(\d+\s*lumens?)/i, "")
        .replace(/this shift.?/i, "")
        .trim();

      let formatted = `PICC line in situ`;
      if (lumens) formatted += `, ${lumens}`;
      if (details) formatted += ` ${details}`;
      formatted += ` this shift.`;

      return formatted;
    }
  );
}

// Helper function to call OpenAI
async function callOpenAI(model, nursingNote) {
  const prompt = `
You are a grammar correction assistant for clinical nursing notes.
Correct only grammar, spelling, and punctuation issues in the following note.

Rules:
- Do NOT rephrase or rewrite sentences if they are already clear.
- Do NOT change clinical terminology or shorthand (e.g., BO ×1, NBM, SpO₂, Pt, C/O).
- Do NOT add or remove any clinical information.
- Keep the same headings and structure as provided.
- Return the note with minimal changes, just fixing grammar/typos.

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
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorBody}`);
  }

  return response.json();
}

// Polish endpoint
app.post("/polish", async (req, res) => {
  console.log("📥 Incoming request to /polish:", req.body); // helpful for debugging

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing." });
    }

    const nursingNote = req.body.nursing_note;
    if (!nursingNote) {
      return res.status(400).json({ error: "Missing nursing_note in request body" });
    }

    let data;
    let modelUsed = "gpt-4o-mini";

    try {
      data = await callOpenAI("gpt-4o-mini", nursingNote);
    } catch (err) {
      console.error("⚠️ gpt-4o-mini failed, falling back to gpt-3.5-turbo:", err.message);
      modelUsed = "gpt-3.5-turbo";
      data = await callOpenAI("gpt-3.5-turbo", nursingNote);
    }

    if (!data.choices || !data.choices.length) {
      throw new Error("OpenAI API returned no choices");
    }

    let polishedNote = data.choices[0].message.content;

    // ✅ Apply PICC rule
    polishedNote = applyPICCFormatting(polishedNote);

    res.json({
      polished_note: polishedNote,
      model_used: modelUsed,
    });
  } catch (error) {
    console.error("❌ Error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to polish note" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Middleware server running on port ${PORT}`));
