const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { getYouTubeEvidence } = require("./services/youtube");
// const { synthesizeRating } = require("./services/gemini"); // uncomment when gemini.js is built

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "ClearCosmetics backend is running" });
});

// POST /analyze
// Accepts scraped product data from the extension (Sharana's scraper output),
// fetches YouTube evidence, runs Gemini synthesis, and returns a rating.
//
// Request body:
// {
//   productName: string,
//   productBrand: string,
//   onPageRating: number,
//   onPageReviews: string[]
// }
//
// Response:
// {
//   rating: "Highly Recommended" | "Recommended" | "Mixed" | "Not Recommended",
//   score: number,
//   pros: string[],
//   cons: string[],
//   evidenceSummary: string,
//   onSiteVsExternalGap: string,
//   youtubeEvidence: object    // included for debugging during dev
// }
app.post("/analyze", async (req, res) => {
  // productBrand, onPageRating, onPageReviews will be passed to Gemini in Phase 1
  const { productName, productBrand: _productBrand, onPageRating: _onPageRating, onPageReviews: _onPageReviews } = req.body;

  if (!productName) {
    return res.status(400).json({ error: "productName is required" });
  }

  try {
    // STEP 1: Fetch and validate YouTube evidence
    const youtubeEvidence = await getYouTubeEvidence(productName);

    // STEP 2: Synthesize with Gemini (stubbed until gemini.js is built)
    // const rating = await synthesizeRating({
    //   productName,
    //   productBrand,
    //   onPageRating,
    //   onPageReviews,
    //   youtubeEvidence,
    // });

    // Temporary stub response — replace with real Gemini call once gemini.js is built
    const rating = {
      rating: "Recommended",
      score: 72,
      pros: ["Stub: YouTube evidence collected successfully"],
      cons: ["Stub: Gemini synthesis not yet wired up"],
      evidenceSummary: "YouTube evidence fetched. Gemini synthesis pending.",
      onSiteVsExternalGap: "Pending Gemini integration.",
    };

    res.json({ ...rating, youtubeEvidence });
  } catch (err) {
    console.error("Error in /analyze:", err.message);
    res.status(500).json({ error: "Analysis failed", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
