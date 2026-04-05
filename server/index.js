const express = require("express");
const cors = require("cors");
require("dotenv").config();

const scoreRouter = require("./routes/score");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "ClearCosmetics backend is running" });
});

// POST /score — main endpoint used by the extension popup
// Body: { productName, pageReviews[] }
// Returns: Gemini rating + YouTube evidence
app.use("/score", scoreRouter);

// Legacy /analyze kept for backwards compat during dev — points to same router
app.use("/analyze", scoreRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
