// Runs after the popup HTML has fully loaded
document.addEventListener("DOMContentLoaded", () => {

  // Grab the UI elements we need to interact with
  const summarizeBtn = document.getElementById("summarizeBtn");
  const summaryBox   = document.getElementById("summaryBox");
  const searchInput  = document.getElementById("search");

  // When the user clicks "Summarize Reviews"...
  summarizeBtn.addEventListener("click", async () => {

    // Show the summary box and display a loading message while we work
    summaryBox.classList.remove("hidden");
    summaryBox.innerHTML = `
      <p>Gathering reviews across all pages...</p>
      <p style="font-size: 0.8em; opacity: 0.6;">This may take a few seconds</p>`;

    try {
      // Find the current active browser tab — that's the page we'll scrape
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Send a message to content.js running on that tab,
      // asking it to extract product + review data
      chrome.tabs.sendMessage(
        tab.id,
        { type: "EXTRACT_PRODUCT_DATA" },
        (response) => {

          // If Chrome itself threw an error (e.g. content script not loaded)
          if (chrome.runtime.lastError) {
            summaryBox.innerHTML = `<p>Error: ${chrome.runtime.lastError.message}</p>`;
            return;
          }

          // If content.js returned a failure response
          if (!response || !response.success) {
            summaryBox.innerHTML = `<p>Failed to extract data. Make sure you're on a product page.</p>`;
            return;
          }

          const data = response.data;

          // FILTER REVIEWS
          // content.js returns reviews as objects: { text, rating, shade }
          const query = searchInput.value.trim().toLowerCase();

          let filteredReviews = data.reviews || [];

          if (query) {
            // Filter on r.text and also r.shade so users can search by shade name
            filteredReviews = filteredReviews.filter(r =>
              r.text.toLowerCase().includes(query) ||
              (r.shade && r.shade.toLowerCase().includes(query))
            );
          }

          // ─────────────────────────────────────────
          // HELPERS
          // ─────────────────────────────────────────

          // Turns a number like "4" into "★★★★☆"
          function renderStars(rating) {
            if (!rating) return "No rating";
            const num = Math.round(parseFloat(rating));
            return "★".repeat(num) + "☆".repeat(5 - num);
          }

          // Safely escapes HTML so review text can't inject scripts into the popup
          function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str;
            return div.innerHTML;
          }

          // ─────────────────────────────────────────
          // BUILD REVIEW LIST HTML
          // Each review is { text, rating, shade }
          // shade is Sephora-specific (e.g. "300 Medium Neutral")
          // ─────────────────────────────────────────
          const reviewsHtml = filteredReviews.slice(0, 10).map(r => `
            <li class="review-item">
              <div class="review-meta">
                <span class="review-stars">${renderStars(r.rating)}</span>
                ${r.shade ? `<span class="review-shade">Shade: ${escapeHtml(r.shade)}</span>` : ""}
              </div>
              <span class="review-text">${escapeHtml(r.text)}</span>
            </li>
          `).join("");

          // Show a message if the search filter returned nothing
          const noResults = filteredReviews.length === 0
            ? `<p class="no-results">No reviews matched "${escapeHtml(query)}".</p>`
            : "";

          // ─────────────────────────────────────────
          // INJECT EVERYTHING INTO THE POPUP
          // ─────────────────────────────────────────
          summaryBox.innerHTML = `
            <div class="product-info">
              <strong class="product-name">${escapeHtml(data.productName || "Unknown Product")}</strong>
              <span class="product-brand">Brand: ${escapeHtml(data.brand || "N/A")}</span>
              <span class="product-price">Price: ${escapeHtml(data.price || "N/A")}</span>
            </div>

            <div class="reviews-section">
              <strong class="reviews-heading">Top Reviews:</strong>
              ${noResults}
              <ul class="review-list">
                ${reviewsHtml}
              </ul>
            </div>
          `;
        }
      );

    } catch (err) {
      // Catch any unexpected JS errors (e.g. tab query failing)
      summaryBox.innerHTML = `<p>Unexpected error: ${err.message}</p>`;
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
      renderResults(resultsBox, productName, data.youtubeEvidence);
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

});
function renderResults(box, productName, evidence) {
  if (!evidence) {
    showError(box, "No YouTube evidence returned.");
    return;
  }

  const { videos, totalVideosChecked, totalVideosRejected, rejectionReasons } = evidence;

  let html = `
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
