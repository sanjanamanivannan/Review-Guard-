const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Backend is running" });
});

app.post("/analyze", (req, res) => {
  const { reviews } = req.body;

  if (!reviews || !Array.isArray(reviews)) {
    return res.status(400).json({ error: "Reviews array is required" });
  }

  res.json({
    trustScore: 72,
    warnings: ["High number of short reviews", "Many 5-star reviews"],
    reviewCount: reviews.length
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
