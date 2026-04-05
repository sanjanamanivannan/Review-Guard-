// services/gemini.js
// Responsibility: Accept YouTube video URLs + on-page reviews + product name,
// pass them to Gemini 1.5 Flash (which reads YouTube URLs directly),
// and return a structured rating object.
// This module does NOT fetch YouTube data — that is youtube.js's job.

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateProductRating(productName, youtubeVideos, pageReviews) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const videoList = youtubeVideos
    .map(
      (v, i) =>
        `Video ${i + 1}: "${v.title}"
     URL: ${v.url}
     Views: ${v.viewCount.toLocaleString()}
     Credibility Score: ${v.credibilityScore}/100
     Sponsored: ${v.sponsored ? "Yes" : "No"}`
    )
    .join("\n\n");

  const reviewText =
    pageReviews.length > 0
      ? pageReviews.join("\n---\n")
      : "No on-page reviews available.";

  const prompt = `
You are an expert makeup product review analyst.

Product being analyzed: "${productName}"

TASK:
You are given ${youtubeVideos.length} YouTube video URLs about this product.
For each video URL, transcribe and analyze what the creator specifically
said about "${productName}". Focus on:
- Their overall opinion of the product
- Specific pros they mentioned
- Specific cons or complaints they mentioned
- Whether their overall recommendation was positive or negative
- Any mention of skin type suitability, longevity, texture, finish

YouTube Videos to analyze:
${videoList}

On-page reviews from the product's official retail page:
${reviewText}

IMPORTANT INSTRUCTIONS:
- Visit and transcribe each YouTube URL to understand what each creator said
- Weight YouTube evidence at 60% of your final rating
- Weight on-page reviews at 40% of your final rating
- Look for alignment or contradiction between YouTube opinions and on-page reviews
- Give less weight to sponsored videos
- Give more weight to high credibility score videos
- Base your rating ONLY on evidence found, not assumptions

Return ONLY a valid JSON object with no markdown, no backticks, no extra text:
{
  "rating": "Highly Recommended" | "Recommended" | "Mixed" | "Not Recommended",
  "score": 0-100,
  "pros": ["specific pro 1", "specific pro 2", "specific pro 3"],
  "cons": ["specific con 1", "specific con 2"],
  "evidenceSummary": "2-3 sentences summarizing what YouTube creators and reviewers said about this specific product",
  "onSiteVsExternalGap": "Describe whether website reviews align with or contradict what YouTube creators said. Be specific."
}

Rating scale:
80-100 = Highly Recommended
60-79 = Recommended
40-59 = Mixed
0-39 = Not Recommended
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    // Retry once with stricter prompt
    try {
      const retryPrompt =
        prompt + "\n\nYou must return only raw JSON. No explanation. No markdown.";
      const retryResult = await model.generateContent(retryPrompt);
      const retryText = retryResult.response.text();
      const retryClean = retryText.replace(/```json|```/g, "").trim();
      return JSON.parse(retryClean);
    } catch {
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
