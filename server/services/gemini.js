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
