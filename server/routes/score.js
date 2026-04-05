// routes/score.js
// Assembles YouTube evidence + on-page reviews and passes them to Gemini.
// This route is the only place that talks to both youtube.js and gemini.js.

const express = require("express");
const router = express.Router();

const { getYouTubeEvidence } = require("../services/youtube");
const { generateProductRating } = require("../services/gemini");

// POST /score
// Body: { productName, pageReviews[] }
// Returns: Gemini rating JSON
router.post("/", async (req, res) => {
  const { productName, pageReviews = [] } = req.body;

  if (!productName) {
    return res.status(400).json({ error: "productName is required" });
  }

  try {
    // Step 1: Get credible YouTube videos
    const youtubeEvidence = await getYouTubeEvidence(productName);

    // Attach full YouTube URL to each video for Gemini
    const videosWithUrls = youtubeEvidence.videos.map((v) => ({
      ...v,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
    }));

    // Step 2: Pass to Gemini for synthesis
    const rating = await generateProductRating(productName, videosWithUrls, pageReviews);

    res.json({ ...rating, youtubeEvidence });
  } catch (err) {
    console.error("Error in /score:", err.message);
    res.status(500).json({ error: "Scoring failed", details: err.message });
  }
});

module.exports = router;
