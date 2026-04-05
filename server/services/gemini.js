// services/gemini.js
// Uses Groq (free) to analyze YouTube transcripts + on-page reviews
// and return a structured product recommendation with clear citations.

const Groq = require("groq-sdk");

if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY in .env");
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanJsonText(text) {
  return text.replace(/```json|```/g, "").trim();
}

function buildVideoEvidence(youtubeVideos) {
  const safeVideos = safeArray(youtubeVideos);

  if (safeVideos.length === 0) {
    return { text: "No external YouTube review evidence available.", hasTranscripts: false };
  }

  let hasTranscripts = false;

  const text = safeVideos.map((v, i) => {
    const title = v?.title || "Unknown title";
    const url = v?.url || "No URL provided";
    const viewCount = typeof v?.viewCount === "number" ? v.viewCount.toLocaleString() : "Unknown";
    const credibilityScore = typeof v?.credibilityScore === "number" ? v.credibilityScore : "Unknown";
    const sponsored = v?.sponsored ? "Yes" : "No";

    let transcriptBlock;
    if (v?.transcript) {
      hasTranscripts = true;
      transcriptBlock = `TRANSCRIPT (actual spoken words — cite this video by its title when referencing it):
"${v.transcript}"`;
    } else {
      transcriptBlock = `TRANSCRIPT: NOT AVAILABLE — do not fabricate any claims from this video.`;
    }

    return `VIDEO ${i + 1}
Title: "${title}"
URL: ${url}
Views: ${viewCount}
Credibility Score: ${credibilityScore}/100
Sponsored: ${sponsored}
${transcriptBlock}`;
  }).join("\n\n---\n\n");

  return { text, hasTranscripts };
}

async function generateProductRating(productName, youtubeVideos = [], pageReviews = []) {
  const safeReviews = safeArray(pageReviews);
  const { text: videoEvidence, hasTranscripts } = buildVideoEvidence(youtubeVideos);

  const reviewText = safeReviews.length > 0
    ? safeReviews.map((r, i) => `Review ${i + 1}: "${r}"`).join("\n")
    : "No on-page reviews available.";

  const transcriptInstruction = hasTranscripts
    ? `TRANSCRIPTS ARE AVAILABLE. You MUST:
- Pull specific quotes or claims directly from the transcript text
- Cite every YouTube claim like this: (from "[video title]")
- Example: "Reviewer noted the formula felt non-sticky and hydrating throughout the day (from \\"Tower 28 ShineOn Lip Jelly Review\\")"
- Do NOT make any claim about a video without quoting or paraphrasing its transcript`
    : `NO TRANSCRIPTS AVAILABLE. Your first summaryBullet MUST say: "No YouTube transcripts were available — analysis based on on-page reviews only." Do not fabricate any YouTube claims.`;

  const prompt = `
You are an expert beauty product review analyst. Analyze the evidence below and return a precise, cited, evidence-based recommendation.

Product: "${productName}"

${transcriptInstruction}

CITATION FORMAT — use this exact format when referencing sources:
- YouTube: (from "[exact video title]")
- On-page review: (from Sephora review)

────────────────────────────────
YOUTUBE VIDEO TRANSCRIPTS (primary source — 60% weight):
────────────────────────────────
${videoEvidence}

────────────────────────────────
ON-PAGE SEPHORA REVIEWS (secondary source — 40% weight):
────────────────────────────────
${reviewText}

────────────────────────────────
RETURN ONLY this JSON — no markdown, no backticks, no extra text:
────────────────────────────────
{
  "rating": "Highly Recommended" | "Recommended" | "Mixed" | "Not Recommended",
  "score": <number 0-100>,
  "summaryBullets": [
    "<specific claim with citation e.g. Reviewer said formula felt lightweight (from \\"Video Title\\")>",
    "<specific claim with citation>"
  ],
  "keyConcern": "<specific concern with citation e.g. Shade oxidized after 2 hours (from \\"Video Title\\") or noted by multiple Sephora reviewers>",
  "strengths": [
    "<specific strength with citation>",
    "<specific strength with citation>",
    "<specific strength with citation>"
  ],
  "verdict": "<one sentence naming the product and who it suits, based strictly on the evidence>"
}

STRICT RULES:
- Every single claim in summaryBullets, keyConcern, and strengths MUST have a citation
- Never say "reviewers noted" without specifying which source
- Never invent claims not found in the transcripts or reviews
- If a transcript mentions something specific (texture, longevity, shade range, packaging, scent, finish) — quote it
- Keep each point concise — one sentence max per bullet
- Do not repeat the same claim across multiple fields

Rating scale:
80-100 = Highly Recommended
60-79 = Recommended
40-59 = Mixed
0-39 = Not Recommended
`.trim();

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const text = completion.choices[0]?.message?.content || "";
    const clean = cleanJsonText(text);

    console.log("Groq raw response:", text);

    const parsed = JSON.parse(clean);
    return { ...parsed, hasTranscripts };

  } catch (error) {
    console.error("Groq error:", error.message);

    return {
      rating: "Mixed",
      score: 50,
      hasTranscripts: false,
      summaryBullets: [
        "Could not retrieve specific evidence for this product.",
        "Try again or check your API key."
      ],
      keyConcern: "Analysis unavailable — Groq request failed.",
      strengths: ["No evidence available"],
      verdict: "Could not complete analysis for this product."
    };
  }
}

module.exports = { generateProductRating };