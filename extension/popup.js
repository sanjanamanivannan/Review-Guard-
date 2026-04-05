// TEMP: YouTube test mode — this file will be replaced when Gemini + Sharana's scraper are ready.
// For now: takes a manually entered product name, hits /analyze, displays raw YouTube evidence.

const BACKEND_URL = "http://localhost:5001";

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("summarizeBtn");
  const input = document.getElementById("productInput");
  const resultsBox = document.getElementById("resultsBox");

  btn.addEventListener("click", async () => {
    const raw = input.value.trim();
    if (!raw) {
      showError(resultsBox, "Please enter a product name or URL.");
      return;
    }

    // If it looks like a URL, pull the product name from the path
    const productName = extractProductName(raw);

    setLoading(btn, resultsBox, productName);

    try {
      const res = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      renderResults(resultsBox, productName, data);
    } catch (err) {
      showError(resultsBox, err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Search YouTube Reviews";
    }
  });
});

// If the input is a URL, extract the meaningful product name segment from the path.
// Falls back to the raw input if it doesn't look like a URL.
function extractProductName(input) {
  try {
    const url = new URL(input);
    // Take the last non-empty path segment, strip ID suffixes, replace hyphens with spaces
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "";
    // Strip trailing product IDs like -P12345 or ?skuId=xxx
    const cleaned = last.replace(/-P\d+$/i, "").replace(/-\d+$/, "").replace(/-/g, " ");
    return cleaned.length > 3 ? cleaned : input;
  } catch {
    return input; // not a URL, use as-is
  }
}

function setLoading(btn, resultsBox, productName) {
  btn.disabled = true;
  btn.textContent = "Searching...";
  resultsBox.classList.remove("hidden");
  resultsBox.innerHTML = `<p class="yt-loading">Searching YouTube for "<strong>${escapeHtml(productName)}</strong>"...</p>`;
}

function renderResults(box, productName, data) {
  if (!data) {
    showError(box, "No results returned.");
    return;
  }

  const { rating, score, pros, cons, evidenceSummary, onSiteVsExternalGap, youtubeEvidence } = data;
  const evidence = youtubeEvidence || {};
  const { videos = [], totalVideosChecked = 0, totalVideosRejected = 0, rejectionReasons = [] } = evidence;

  let html = "";

  // ── Gemini Rating ──
  if (rating) {
    const ratingColor = { "Highly Recommended": "#16a34a", "Recommended": "#2563eb", "Mixed": "#d97706", "Not Recommended": "#dc2626" }[rating] || "#6b7280";
    html += `
      <div class="gemini-rating" style="border-left: 4px solid ${ratingColor};">
        <div class="gemini-rating-label" style="color:${ratingColor};">${rating}</div>
        ${score != null ? `<div class="gemini-score">Score: ${score}/100</div>` : ""}
        ${evidenceSummary ? `<p class="gemini-summary">${escapeHtml(evidenceSummary)}</p>` : ""}
        ${onSiteVsExternalGap && onSiteVsExternalGap !== "Unknown" ? `<p class="gemini-gap"><strong>On-site vs external:</strong> ${escapeHtml(onSiteVsExternalGap)}</p>` : ""}
        ${pros && pros.length > 0 ? `<div class="gemini-list"><strong>Pros:</strong><ul>${pros.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul></div>` : ""}
        ${cons && cons.length > 0 ? `<div class="gemini-list"><strong>Cons:</strong><ul>${cons.map(c => `<li>${escapeHtml(c)}</li>`).join("")}</ul></div>` : ""}
      </div>
    `;
  }

  // ── YouTube results header ──
  html += `
    <div class="yt-header">
      <span class="yt-title">YouTube Results for "<strong>${escapeHtml(productName)}</strong>"</span>
      <span class="yt-meta">${totalVideosChecked} checked · ${totalVideosRejected} rejected · ${videos.length} used</span>
    </div>
  `;

  if (videos.length === 0) {
    html += `<p class="yt-empty">No credible videos found after filtering.</p>`;
  } else {
    html += `<div class="yt-list">`;
    for (const v of videos) {
      const scoreClass = v.credibilityScore >= 60 ? "score-high" : v.credibilityScore >= 40 ? "score-mid" : "score-low";
      const sponsoredTag = v.sponsored ? `<span class="tag tag-sponsored">Sponsored</span>` : "";
      const transcriptTag = v.transcriptChunks && v.transcriptChunks.length > 0
        ? `<span class="tag tag-transcript">Transcript ✓</span>`
        : `<span class="tag tag-no-transcript">No transcript</span>`;

      html += `
        <div class="yt-card">
          <div class="yt-card-top">
            <span class="yt-score ${scoreClass}">${v.credibilityScore}</span>
            <a class="yt-video-title" href="https://youtube.com/watch?v=${escapeHtml(v.videoId)}" target="_blank">${escapeHtml(v.title)}</a>
          </div>
          <div class="yt-card-meta">
            <span>${formatNumber(v.viewCount)} views · ${formatNumber(v.likeCount)} likes · ${(v.likeToViewRatio * 100).toFixed(1)}% ratio</span>
          </div>
          <div class="yt-tags">${sponsoredTag}${transcriptTag}</div>
        </div>
      `;
    }
    html += `</div>`;
  }

  if (rejectionReasons.length > 0) {
    html += `<details class="yt-rejected">
      <summary>${rejectionReasons.length} rejected video(s)</summary>
      <ul>`;
    for (const r of rejectionReasons) {
      html += `<li><strong>${escapeHtml(r.title || r.videoId)}</strong>: ${escapeHtml(r.reason)}</li>`;
    }
    html += `</ul></details>`;
  }

  box.innerHTML = html;
}

function showError(box, message) {
  box.classList.remove("hidden");
  box.innerHTML = `<p class="yt-error">Error: ${escapeHtml(message)}</p>`;
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
