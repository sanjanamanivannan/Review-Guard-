const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { getYouTubeEvidence } = require("./services/youtube");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "ClearCosmetics backend is running" });
});

// TESTING — delete later
app.get("/test-youtube", async (req, res) => {
  try {
    const result = await getYouTubeEvidence("ILIA Triclone Skin Tech Foundation");
    console.log("YouTube result:", JSON.stringify(result, null, 2));
    res.json(result);
  } catch (err) {
    console.error("YouTube test failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/analyze", async (req, res) => {
  const { productName, brand } = req.body;

  if (!productName) {
    return res.status(400).json({ error: "productName is required" });
  }

  try {
    const youtubeEvidence = await getYouTubeEvidence(`${brand} ${productName}`.trim());
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