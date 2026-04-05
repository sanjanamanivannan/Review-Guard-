const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: ".env.local" });


const { getYouTubeEvidence } = require("./services/youtube");
const { generateProductRating } = require("./services/gemini");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "ClearCosmetics backend is running" });
});

app.post("/analyze", async (req, res) => {
  const { productName, brand, onPageRating, onPageReviews } = req.body;

  if (!productName) {
    return res.status(400).json({ error: "productName is required" });
  }

  try {
    // STEP 1 — Fetch YouTube evidence including transcripts
    const youtubeEvidence = await getYouTubeEvidence(`${brand} ${productName}`.trim());

    // STEP 2 — Run Groq analysis on YouTube transcripts + on-page reviews
    const rating = await generateProductRating(
      `${brand} ${productName}`.trim(),
      youtubeEvidence.videos,
      onPageReviews || []
    );

    // STEP 3 — Strip transcript text before sending to frontend
    // Transcripts are large (2000 chars x 5 videos) and not needed in the UI.
    // Replace with a boolean so popup.js can show the "Transcript used" tag correctly.
    const sanitizedEvidence = {
      ...youtubeEvidence,
      videos: youtubeEvidence.videos.map(v => ({
        ...v,
        transcript: v.transcript ? true : null
      }))
    };

    res.json({ ...rating, youtubeEvidence: sanitizedEvidence });

  } catch (err) {
    console.error("Error in /analyze:", err.message);
    res.status(500).json({ error: "Analysis failed", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});