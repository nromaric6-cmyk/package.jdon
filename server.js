require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

const { ANTHROPIC_API_KEY, PORT = 3000 } = process.env;

const SYSTEM_PROMPT = `Tu es un analyste ICT (Inner Circle Trader) spécialisé en price action Forex/crypto.
On te fournit trois captures d'écran de graphique, dans cet ordre : 15 minutes (biais), 5 minutes (sweep de liquidité), 1 minute (entrée FVG).

Applique STRICTEMENT cette méthodologie :
1. HTF (15min) : détecte un BOS ou CHoCH. bias = "bullish", "bearish" ou "neutral". Si neutral, arrête.
2. MTF (5min) : cherche un sweep de liquidité (mèche qui dépasse un high/low évident) suivi d'un retour dans la range.
3. LTF (1min) : si sweep confirmé, localise un FVG/iFVG. Calcule entrée (bord du FVG), stop loss (au-delà du sweep), take profit (prochaine liquidité opposée), et le ratio RR.

Règles de rejet : si une confluence manque, confidence = "low" ou "none". Si RR < 2, rejected = true.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après, sans balises markdown :
{
  "bias": "bullish|bearish|neutral",
  "confluence": { "htf": boolean, "sweep": boolean, "fvg": boolean },
  "entry": number|null,
  "sl": number|null,
  "tp": number|null,
  "rr": number|null,
  "confidence": "high|medium|low|none",
  "rejected": boolean,
  "reason": "courte explication en français"
}`;

app.post("/api/analyze", async (req, res) => {
  try {
    const { htf, mtf, ltf } = req.body;
    if (!htf || !mtf || !ltf) return res.status(400).json({ error: "Il manque une des 3 images (htf/mtf/ltf)." });

    const content = [
      { type: "text", text: "Graphique 15 minutes :" },
      { type: "image", source: { type: "base64", media_type: htf.mediaType, data: htf.base64 } },
      { type: "text", text: "Graphique 5 minutes :" },
      { type: "image", source: { type: "base64", media_type: mtf.mediaType, data: mtf.base64 } },
      { type: "text", text: "Graphique 1 minute :" },
      { type: "image", source: { type: "base64", media_type: ltf.mediaType, data: ltf.base64 } },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) return res.status(502).json({ error: "Réponse vide du modèle." });

    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

app.listen(PORT, () => console.log(`Site en ligne sur le port ${PORT}`));
