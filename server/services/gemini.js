// services/gemini.js
// Responsibility: Accept structured evidence (YouTube data + on-page reviews),
// call the Gemini API, and return a structured rating object.
// This module does NOT fetch data — that is youtube.js / scraper's job.
//
// PHASE 1 — Build this next after youtube.js is wired up.
//
// Expected input shape:
// {
//   productName: string,
//   productBrand: string,
//   onPageRating: number,          // from Sharana's scraper
//   onPageReviews: string[],       // from Sharana's scraper
//   youtubeEvidence: {             // from youtube.js → getYouTubeEvidence()
//     videos: Array,
//     totalVideosChecked: number,
//     totalVideosRejected: number,
//   }
//   // Phase 2: userProfile will be added here for personalization
//   // Phase 4: redditEvidence will be added here
// }
//
// Expected output shape (always return this exact structure):
// {
//   rating: "Highly Recommended" | "Recommended" | "Mixed" | "Not Recommended",
//   score: 0-100,           // used internally to determine rating label
//   pros: string[],
//   cons: string[],
//   evidenceSummary: string,
//   onSiteVsExternalGap: string   // key signal: does product page match YouTube?
// }
//
// Weights for Gemini prompt (do not expose to user):
//   35% YouTube evidence
//   25% on-page reviews
//   30% personalized fit (Phase 2, not built yet — skip for now)
//   10% confidence from evidence volume
//
// Model: gemini-2.0-flash

// TODO: implement synthesizeRating(evidence) using @google/generative-ai

module.exports = {};

// services/gemini.js
// Takes YouTube video URLs, passes them directly to Gemini,
// and returns a summary of what the videos say about the product.

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Formats Sephora reviews into a clean list for the prompt
function formatSephoraReviews(reviews) {
  if (!reviews || reviews.length === 0) return "No on-site reviews available.";
  return reviews.map(r => {
    const stars = r.rating ? `${r.rating}/5 stars` : "";
    const shade = r.shade ? ` (Shade: ${r.shade})` : "";
    return `- ${stars}${shade} ${r.text}`;
  }).join("\n");
}

async function synthesizeRating({ productName, brand, onPageReviews, onPageRating, youtubeEvidence }) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

 const videos = (youtubeEvidence?.videos || []).slice(0, 2);

  // Pass each YouTube URL directly to Gemini — it can watch them natively
  const videoParts = videos.map(v => ({
    fileData: {
      mimeType: "video/mp4",
      fileUri: v.url
    }
  }));

  const textPrompt = `
You are a beauty product analyst. Watch these YouTube videos and summarize what the reviewers say about this specific product:

PRODUCT: ${brand ? `${brand} - ` : ""}${productName}
ON-SITE RATING: ${onPageRating ? `${onPageRating}/5` : "Not available"}

──────────────────────────────
SEPHORA CUSTOMER REVIEWS (weight: 25%)
──────────────────────────────
${formatSephoraReviews(onPageReviews)}

──────────────────────────────
YOUTUBE VIDEOS (weight: 35%)
──────────────────────────────
The YouTube video links are attached. Watch each one and extract what the reviewer says specifically about this product.


Return a JSON object with exactly this structure:

{
  "rating": "Highly Recommended" | "Recommended" | "Mixed" | "Not Recommended",
  "score": <number 0-100>,
  "pros": [<string>, <string>, <string>],
  "cons": [<string>, <string>, <string>],
  "evidenceSummary": "<2-3 sentences summarizing what the YouTubers said>",
  "bestFor": "<1 sentence describing who this product is best suited for>"
}

Rules:
- Return ONLY the JSON. No markdown, no backticks, no explanation.
- Base everything strictly on what the videos say — do not invent anything.
`.trim();

  const contentParts = [...videoParts, { text: textPrompt }];

  console.log(`Sending ${videos.length} YouTube videos + ${(onPageReviews || []).length} Sephora reviews to Gemini...`);

  const result = await model.generateContent(contentParts);
  const text = result.response.text();
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error("Gemini returned non-JSON:", text);
    return {
      rating: "Mixed",
      score: 50,
      pros: ["Could not parse Gemini response"],
      cons: ["Could not parse Gemini response"],
      evidenceSummary: text.slice(0, 300),
      onSiteVsExternalGap: "Parsing failed.",
      bestFor: "Unknown"
    };
  }
}

module.exports = { synthesizeRating };