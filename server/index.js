const express = require("express");
const cors = require("cors");
require("dotenv").config();

const scoreRouter = require("./routes/score");
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

// POST /score — main endpoint
// POST /analyze — called by popup.js, routes to same handler
app.use("/score", scoreRouter);
app.use("/analyze", scoreRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
