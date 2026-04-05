const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY in .env");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanJsonText(text) {
  return text.replace(/```json|```/g, "").trim();
}

function buildVideoEvidence(youtubeVideos) {
  const safeVideos = safeArray(youtubeVideos);

  if (safeVideos.length === 0) {
    return "No external YouTube review evidence available.";
  }

  return safeVideos
    .map((v, i) => {
      const title = v?.title || "Unknown title";
      const url = v?.url || "No URL provided";
      const viewCount =
        typeof v?.viewCount === "number"
          ? v.viewCount.toLocaleString()
          : "Unknown";
      const credibilityScore =
        typeof v?.credibilityScore === "number"
          ? v.credibilityScore
          : "Unknown";
      const sponsored = v?.sponsored ? "Yes" : "No";

      const reviewEvidence =
        v?.reviewSummary ||
        v?.snippet ||
        v?.description ||
        v?.transcriptExcerpt ||
        v?.commentsSummary ||
        "No detailed review text was provided for this video.";

      return `Video ${i + 1}
Title: ${title}
URL: ${url}
Views: ${viewCount}
Credibility Score: ${credibilityScore}/100
Sponsored: ${sponsored}
Reviewer Evidence: ${reviewEvidence}`;
    })
    .join("\n\n---\n\n");
}

async function generateProductRating(productName, youtubeVideos = [], pageReviews = []) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  try {
    const safeReviews = safeArray(pageReviews);
    const videoEvidence = buildVideoEvidence(youtubeVideos);

    const reviewText =
      safeReviews.length > 0
        ? safeReviews.join("\n---\n")
        : "No on-page reviews available.";

    const prompt = `
You are an expert beauty product review analyst.

Product being analyzed: "${productName}"

Your job is to evaluate the product using:
1. External YouTube review evidence that has already been extracted for you
2. On-page reviews from the retailer website

IMPORTANT RULES:
- Do NOT say you watched, opened, visited, or transcribed any video
- Only use the review evidence explicitly provided below
- Summarize what reviewers said about the product itself
- Give less weight to sponsored videos
- Give more weight to higher credibility videos
- Weight YouTube/external evidence at 60%
- Weight on-page reviews at 40%
- Focus on claims about performance, skin type, finish, wear time, texture, irritation, shade match, oxidation, and value
- Be specific and evidence-based
- If evidence is limited or mixed, reflect that honestly
- Keep everything short, punchy, and easy to scan
- Do NOT write paragraphs
- Every sentence must be concise
- Each strength should be a short phrase, not a long sentence
- Keep the tone polished, modern, and concise

External YouTube review evidence:
${videoEvidence}

On-page reviews from the product page:
${reviewText}

Return ONLY a valid JSON object with no markdown and no extra text:
{
  "rating": "Highly Recommended" | "Recommended" | "Mixed" | "Not Recommended",
  "score": 0,
  "summaryBullets": [
    "Short bullet 1",
    "Short bullet 2"
  ],
  "keyConcern": "One short sentence naming the biggest concern.",
  "strengths": [
    "Short phrase 1",
    "Short phrase 2",
    "Short phrase 3"
  ],
  "verdict": "One short sentence with the final takeaway."
}

FIELD RULES:
- summaryBullets must contain exactly 2 bullets
- each summary bullet must be 1 sentence max
- keyConcern must be 1 sentence max
- strengths must contain 2 to 4 short phrases
- verdict must be 1 sentence max
- Do not repeat the same idea across multiple fields

Rating scale:
80-100 = Highly Recommended
60-79 = Recommended
40-59 = Mixed
0-39 = Not Recommended
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = cleanJsonText(text);

    console.log("Gemini raw text:", text);
    console.log("Gemini cleaned text:", clean);

    return JSON.parse(clean);
  } catch (error) {
    console.error("Gemini generateProductRating error:", error);

    try {
      const retryPrompt = `
Return ONLY valid raw JSON for a beauty product review result.

Schema:
{
  "rating": "Highly Recommended" | "Recommended" | "Mixed" | "Not Recommended",
  "score": 0,
  "summaryBullets": [
    "Short bullet 1",
    "Short bullet 2"
  ],
  "keyConcern": "One short sentence naming the biggest concern.",
  "strengths": [
    "Short phrase 1",
    "Short phrase 2"
  ],
  "verdict": "One short sentence with the final takeaway."
}
`;

      const retryResult = await model.generateContent(retryPrompt);
      const retryText = retryResult.response.text();
      const retryClean = cleanJsonText(retryText);

      console.log("Gemini retry raw text:", retryText);
      console.log("Gemini retry cleaned text:", retryClean);

      return JSON.parse(retryClean);
    } catch (retryError) {
      console.error("Gemini retry error:", retryError);

      return {
        rating: "Mixed",
        score: 50,
        summaryBullets: [
          "Results were mixed across external and on-site reviews.",
          "More evidence is needed for a stronger recommendation."
        ],
        keyConcern: "Could not confidently identify the biggest concern.",
        strengths: ["Some positive feedback", "Mixed external sentiment"],
        verdict: "Promising, but not fully convincing."
      };
    }
  }
}

module.exports = { generateProductRating };