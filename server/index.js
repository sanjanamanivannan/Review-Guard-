const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: ".env.local" });


// Pull in our two services — YouTube fetches video evidence,
// Gemini watches the videos and reads reviews to generate a rating
const { getYouTubeEvidence } = require("./services/youtube");
const { generateProductRating } = require("./services/gemini");
const { synthesizeRating } = require("./services/gemini");

const app = express();
const PORT = process.env.PORT || 5001;

// Allow the Chrome extension to talk to this server —
// without this, the browser blocks cross-origin requests
app.use(cors({ origin: "*" }));

// Tell Express to parse incoming JSON request bodies
// so we can read req.body in our routes
app.use(express.json());

// Health check — visit http://localhost:5001 to confirm the server is running
app.get("/", (_req, res) => {
  res.json({ message: "ClearCosmetics backend is running" });
});

app.post("/analyze", async (req, res) => {
  const { productName, brand, onPageRating, onPageReviews } = req.body;
// Main route — this is what popup.js calls when the user clicks Summarize
// It receives the scraped Sephora data, fetches YouTube videos,
// feeds everything to Gemini, and sends back a full recommendation
app.post("/analyze", async (req, res) => {

  // These four fields come from popup.js in the POST body:
  // - productName and brand come from content.js scraping the Sephora page
  // - onPageRating and onPageReviews are the scraped reviews also from content.js
  const { productName, brand, onPageRating, onPageReviews } = req.body;

  // Can't do anything without a product name — return early with an error
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
    // STEP 1 — Search YouTube for review videos of this product
    // We combine brand + productName for a more specific search
    // e.g. "Tower 28 Beauty ShineOn Lip Jelly review"
    const youtubeEvidence = await getYouTubeEvidence(`${brand} ${productName}`.trim());

    // STEP 2 — Pass the YouTube video URLs and Sephora reviews to Gemini
    // Gemini watches the videos natively and reads the reviews,
    // then returns a structured JSON recommendation
    const rating = await synthesizeRating({
      productName,
      brand,
      onPageRating,
      onPageReviews: onPageReviews || [], // fallback to empty array if not sent
      youtubeEvidence,
    });

    // Send the Gemini rating + raw YouTube evidence back to popup.js
    // popup.js uses this to render the results in the extension UI
    res.json({ ...rating, youtubeEvidence });

  } catch (err) {
    // Something went wrong in either the YouTube fetch or Gemini call —
    // log it on the server and send a clean error back to the extension
    console.error("Error in /analyze:", err.message);
    res.status(500).json({ error: "Analysis failed", details: err.message });
  }
});

// Start the server — everything above is just setup, this line actually runs it
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});