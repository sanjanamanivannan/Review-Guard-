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

      // These are the fields Gemini should actually analyze.
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
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
- Focus on claims about performance, skin type, finish, wear time, texture, irritation, shade match, and value
- Be specific and evidence-based
- If evidence is limited or mixed, reflect that honestly

External YouTube review evidence:
${videoEvidence}

On-page reviews from the product page:
${reviewText}

Return ONLY a valid JSON object with no markdown and no extra text:
{
  "rating": "Highly Recommended" | "Recommended" | "Mixed" | "Not Recommended",
  "score": 0,
  "pros": ["specific pro 1", "specific pro 2", "specific pro 3"],
  "cons": ["specific con 1", "specific con 2"],
  "evidenceSummary": "2-3 sentences summarizing what external reviewers and on-page reviewers said about this specific product.",
  "onSiteVsExternalGap": "State whether the retailer-site reviews align with or contradict the external review evidence, and how."
}

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
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const retryPrompt = `
Return ONLY valid raw JSON for a beauty product review result.

Schema:
{
  "rating": "Highly Recommended" | "Recommended" | "Mixed" | "Not Recommended",
  "score": 0,
  "pros": [],
  "cons": [],
  "evidenceSummary": "",
  "onSiteVsExternalGap": ""
}
`;

      const retryResult = await model.generateContent(retryPrompt);
      const retryText = retryResult.response.text();
      const retryClean = cleanJsonText(retryText);

      return JSON.parse(retryClean);
    } catch (retryError) {
      console.error("Gemini retry error:", retryError);

      return {
        rating: "Mixed",
        score: 50,
        pros: [],
        cons: [],
        evidenceSummary: "Could not generate summary at this time.",
        onSiteVsExternalGap: "Unknown",
      };
    }
  }
}

module.exports = { generateProductRating };