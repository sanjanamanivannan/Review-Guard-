// services/youtube.js
// Responsibility: Search YouTube for product reviews, validate video credibility,
// pull transcripts, and return structured evidence.
// This module does NOT score or synthesize — that is gemini.js's job.

const axios = require("axios");

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// Description keywords that suggest a video is sponsored
const SPONSORED_FLAGS = ["sponsored", "paid partnership", "#ad", "#sponsored"];

// Description keywords that boost credibility (creator signals honesty)
const NOT_SPONSORED_BOOSTS = ["not sponsored", "gifted but honest", "my own purchase"];

// Comment phrases that suggest the video is untrustworthy
const COMMENT_FLAG_KEYWORDS = [
  "this is inaccurate",
  "she was paid",
  "misleading",
  "don't trust this",
  "he was paid",
  "they were paid",
  "paid review",
];

// Comment phrases that boost credibility
const COMMENT_BOOST_KEYWORDS = [
  "so accurate",
  "same experience",
  "she's always honest",
  "he's always honest",
  "always honest",
  "totally agree",
];


// ─── STEP 1: Search YouTube ───────────────────────────────────────────────────

async function searchYouTube(productName) {
  const query = `${productName} review`;
  const response = await axios.get(`${YOUTUBE_API_BASE}/search`, {
    params: {
      part: "snippet",
      q: query,
      type: "video",
      maxResults: 10,
      key: process.env.YOUTUBE_API_KEY,
    },
  });

  // If YouTube returned an error object, log it and return empty
  // This catches invalid API keys, disabled APIs, quota exceeded, etc.
  if (response.data.error) {
    console.error("YouTube API error:", JSON.stringify(response.data.error, null, 2));
    return [];
  }

  return response.data.items || [];
}


// ─── STEP 2 helpers ──────────────────────────────────────────────────────────

async function getVideoDetails(videoId) {
  const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
    params: {
      part: "snippet,statistics",
      id: videoId,
      key: process.env.YOUTUBE_API_KEY,
    },
  });

  if (response.data.error) {
    console.error("YouTube video details error:", JSON.stringify(response.data.error, null, 2));
    return null;
  }

  return response.data.items[0] || null;
}

async function getTopComments(videoId) {
  try {
    const response = await axios.get(`${YOUTUBE_API_BASE}/commentThreads`, {
      params: {
        part: "snippet",
        videoId,
        maxResults: 15,
        order: "relevance",
        key: process.env.YOUTUBE_API_KEY,
      },
    });
    return response.data.items.map((item) =>
      item.snippet.topLevelComment.snippet.textDisplay.toLowerCase()
    );
  } catch {
    // Comments may be disabled — not a reason to reject the video
    return [];
  }
}

function checkSponsorship(description) {
  const lower = description.toLowerCase();
  const isSponsored = SPONSORED_FLAGS.some((kw) => lower.includes(kw));
  const hasBoost = NOT_SPONSORED_BOOSTS.some((kw) => lower.includes(kw));
  return { isSponsored, hasBoost };
}

function checkComments(comments) {
  const flagCount = comments.filter((c) =>
    COMMENT_FLAG_KEYWORDS.some((kw) => c.includes(kw))
  ).length;
  const boostCount = comments.filter((c) =>
    COMMENT_BOOST_KEYWORDS.some((kw) => c.includes(kw))
  ).length;
  // Reject if 2+ top comments raise credibility concerns
  const flagged = flagCount >= 2;
  return { flagged, flagCount, boostCount };
}

function calculateCredibilityScore({ isSponsored, hasBoost, likeToViewRatio, boostCount }) {
  let score = 50;

  if (isSponsored) score -= 20;
  if (hasBoost) score += 10;

  // Like-to-view ratio: >4% is strong, <1% is weak
  if (likeToViewRatio >= 0.04) score += 15;
  else if (likeToViewRatio >= 0.02) score += 8;
  else if (likeToViewRatio < 0.01) score -= 10;

  // Each credibility-boosting comment adds up to a max of 20 points
  score += Math.min(boostCount * 5, 20);

  return Math.max(0, Math.min(100, score));
}


// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Given a product name, searches YouTube, validates videos for credibility,
 * and returns the top 5 ranked videos for Gemini to analyze later.
 *
 * @param {string} productName — e.g. "Rare Beauty Soft Pinch Tinted Lip Oil"
 * @returns {Promise<{
 *   videos: Array,
 *   totalVideosChecked: number,
 *   totalVideosRejected: number,
 *   rejectionReasons: Array
 * }>}
 */
async function getYouTubeEvidence(productName) {
  const rejectionReasons = [];

  // STEP 1 — Search
  const searchResults = await searchYouTube(productName);

  // If search returned nothing (e.g. bad API key), return empty structure
  if (searchResults.length === 0) {
    console.warn("No YouTube search results returned — check API key and quota");
    return {
      videos: [],
      totalVideosChecked: 0,
      totalVideosRejected: 0,
      rejectionReasons: [],
    };
  }

  // STEP 2 — Validate each candidate
  const validated = [];

  for (const item of searchResults) {
    const videoId = item.id.videoId;
    const title = item.snippet.title;

    const details = await getVideoDetails(videoId);
    if (!details) {
      rejectionReasons.push({ videoId, title, reason: "Could not fetch video details" });
      continue;
    }

    const description = details.snippet.description || "";
    const stats = details.statistics || {};
    const viewCount = parseInt(stats.viewCount, 10) || 0;
    const likeCount = parseInt(stats.likeCount, 10) || 0;
    const likeToViewRatio = viewCount > 0 ? likeCount / viewCount : 0;

    const { isSponsored, hasBoost } = checkSponsorship(description);

    const comments = await getTopComments(videoId);
    const { flagged, flagCount, boostCount } = checkComments(comments);

    // Remove from pool entirely if flagged by multiple comments
    if (flagged) {
      rejectionReasons.push({
        videoId,
        title,
        reason: `Flagged by ${flagCount} top comments as untrustworthy`,
      });
      continue;
    }

    const credibilityScore = calculateCredibilityScore({
      isSponsored,
      hasBoost,
      likeToViewRatio,
      boostCount,
    });

    validated.push({
      videoId,
      title,
      channelTitle: details.snippet.channelTitle || "",
      description,
      publishedAt: details.snippet.publishedAt || "",
      thumbnail: details.snippet.thumbnails?.high?.url || "",
      viewCount,
      likeCount,
      likeToViewRatio,
      sponsored: isSponsored,
      credibilityScore,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  // STEP 3 — Select top 5 by credibility score
  const top5 = validated
    .sort((a, b) => b.credibilityScore - a.credibilityScore)
    .slice(0, 5);

  return {
    videos: top5,
    totalVideosChecked: searchResults.length,
    totalVideosRejected: searchResults.length - validated.length,
    rejectionReasons,
  };
}

module.exports = { getYouTubeEvidence };