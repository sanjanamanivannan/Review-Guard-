// services/youtube.js
// Responsibility: Search YouTube for product reviews, validate video credibility,
// fetch transcripts via Supadata, and return structured evidence.
// This module does NOT score or synthesize — that is gemini.js's job.

const axios = require("axios");

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

const SPONSORED_FLAGS      = ["sponsored", "paid partnership", "#ad", "#sponsored"];
const NOT_SPONSORED_BOOSTS = ["not sponsored", "gifted but honest", "my own purchase"];

const COMMENT_FLAG_KEYWORDS = [
  "this is inaccurate", "she was paid", "misleading", "don't trust this",
  "he was paid", "they were paid", "paid review",
];
const COMMENT_BOOST_KEYWORDS = [
  "so accurate", "same experience", "she's always honest",
  "he's always honest", "always honest", "totally agree",
];

// ─── STEP 1: Search YouTube ───────────────────────────────────────────────────

async function searchYouTube(productName) {
  const query = `${productName} full review`;
  const response = await axios.get(`${YOUTUBE_API_BASE}/search`, {
    params: {
      part: "snippet",
      q: query,
      type: "video",
      maxResults: 10,
      videoDuration: "medium",
      key: process.env.YOUTUBE_API_KEY,
    },
  });

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
    return [];
  }
}

// Fetches transcript using Supadata's free YouTube transcript API.
// Only called for the top 5 videos after credibility scoring —
// so we never fetch more transcripts than we actually use.
async function getVideoTranscript(videoId) {
  try {
    console.log(`Fetching transcript for ${videoId} via Supadata...`);

    const response = await axios.get("https://api.supadata.ai/v1/youtube/transcript", {
      params: {
        videoId,
        lang: "en",
      },
      headers: {
        "x-api-key": process.env.SUPADATA_API_KEY,
      },
    });

    const content = response.data?.content;

    if (!content || content.length === 0) {
      console.log(`No transcript content returned for ${videoId}`);
      return null;
    }

    const text = Array.isArray(content)
      ? content.map(c => c.text).join(" ").slice(0, 2000).trim()
      : String(content).slice(0, 2000).trim();

    console.log(`Transcript fetched for ${videoId}: ${text.length} chars`);
    return text;

  } catch (err) {
    if (err.response) {
      console.log(`Transcript failed for ${videoId}: HTTP ${err.response.status} — ${JSON.stringify(err.response.data)}`);
    } else {
      console.log(`Transcript failed for ${videoId}: ${err.message}`);
    }
    return null;
  }
}

function checkSponsorship(description) {
  const lower = description.toLowerCase();
  return {
    isSponsored: SPONSORED_FLAGS.some((kw) => lower.includes(kw)),
    hasBoost:    NOT_SPONSORED_BOOSTS.some((kw) => lower.includes(kw)),
  };
}

function checkComments(comments) {
  const flagCount  = comments.filter((c) => COMMENT_FLAG_KEYWORDS.some((kw) => c.includes(kw))).length;
  const boostCount = comments.filter((c) => COMMENT_BOOST_KEYWORDS.some((kw) => c.includes(kw))).length;
  return { flagged: flagCount >= 2, flagCount, boostCount };
}

function calculateCredibilityScore({ isSponsored, hasBoost, likeToViewRatio, boostCount }) {
  let score = 50;
  if (isSponsored)                  score -= 20;
  if (hasBoost)                     score += 10;
  if (likeToViewRatio >= 0.04)      score += 15;
  else if (likeToViewRatio >= 0.02) score += 8;
  else if (likeToViewRatio < 0.01)  score -= 10;
  score += Math.min(boostCount * 5, 20);
  return Math.max(0, Math.min(100, score));
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function getYouTubeEvidence(productName) {
  const rejectionReasons = [];
  const searchResults = await searchYouTube(productName);

  if (searchResults.length === 0) {
    console.warn("No YouTube search results returned — check API key and quota");
    return { videos: [], totalVideosChecked: 0, totalVideosRejected: 0, rejectionReasons: [] };
  }

  const validated = [];

  for (const item of searchResults) {
    const videoId = item.id.videoId;
    const title   = item.snippet.title;

    // Skip Shorts — no spoken content, transcripts unavailable
    if (title.toLowerCase().includes("#shorts") || title.toLowerCase().includes("shorts")) {
      rejectionReasons.push({ videoId, title, reason: "Skipped — Short video, no transcript expected" });
      continue;
    }

    const details = await getVideoDetails(videoId);
    if (!details) {
      rejectionReasons.push({ videoId, title, reason: "Could not fetch video details" });
      continue;
    }

    const description     = details.snippet.description || "";
    const stats           = details.statistics || {};
    const viewCount       = parseInt(stats.viewCount, 10) || 0;
    const likeCount       = parseInt(stats.likeCount, 10) || 0;
    const likeToViewRatio = viewCount > 0 ? likeCount / viewCount : 0;

    const { isSponsored, hasBoost }          = checkSponsorship(description);
    const comments                           = await getTopComments(videoId);
    const { flagged, flagCount, boostCount } = checkComments(comments);

    if (flagged) {
      rejectionReasons.push({ videoId, title, reason: `Flagged by ${flagCount} top comments as untrustworthy` });
      continue;
    }

    const credibilityScore = calculateCredibilityScore({ isSponsored, hasBoost, likeToViewRatio, boostCount });

    // Push without transcript — we fetch transcripts only for the top 5 below
    validated.push({
      videoId,
      title,
      channelTitle:   details.snippet.channelTitle || "",
      description,
      transcript:     null,
      publishedAt:    details.snippet.publishedAt || "",
      thumbnail:      details.snippet.thumbnails?.high?.url || "",
      viewCount,
      likeCount,
      likeToViewRatio,
      sponsored:      isSponsored,
      credibilityScore,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  // Sort by credibility and take top 5 BEFORE fetching transcripts
  // so we only fetch transcripts for videos we actually use
  const top5 = validated
    .sort((a, b) => b.credibilityScore - a.credibilityScore)
    .slice(0, 5);

  console.log(`Fetching transcripts for top ${top5.length} videos...`);

  // Fetch transcripts in parallel for speed
  const top5WithTranscripts = await Promise.all(
    top5.map(async (v) => {
      const transcript = await getVideoTranscript(v.videoId);
      return { ...v, transcript };
    })
  );

  return {
    videos:              top5WithTranscripts,
    totalVideosChecked:  searchResults.length,
    totalVideosRejected: searchResults.length - validated.length,
    rejectionReasons,
  };
}

module.exports = { getYouTubeEvidence };