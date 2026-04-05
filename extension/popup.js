document.addEventListener("DOMContentLoaded", () => {

  const summarizeBtn = document.getElementById("summarizeBtn");
  const summaryBox   = document.getElementById("summaryBox");
  const searchInput  = document.getElementById("search");

  summarizeBtn.addEventListener("click", async () => {

    summaryBox.classList.remove("hidden");
    summaryBox.innerHTML = `
      <p>Gathering reviews across all pages...</p>
      <p style="font-size: 0.8em; opacity: 0.6;">This may take a few seconds</p>`;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PRODUCT_DATA" }, async (response) => {

        if (chrome.runtime.lastError) {
          summaryBox.innerHTML = `<p>Error: ${chrome.runtime.lastError.message}</p>`;
          return;
        }

        if (!response || !response.success) {
          summaryBox.innerHTML = `<p>Failed to extract data. Make sure you're on a product page.</p>`;
          return;
        }

        const data = response.data;

        // Filter reviews by search query — matches on text or shade name
        const query = searchInput.value.trim().toLowerCase();
        let filteredReviews = data.reviews || [];

        if (query) {
          filteredReviews = filteredReviews.filter(r =>
            r.text.toLowerCase().includes(query) ||
            (r.shade && r.shade.toLowerCase().includes(query))
          );
        }

        // Converts "4" → "★★★★☆"
        function renderStars(rating) {
          if (!rating) return "No rating";
          const num = Math.round(parseFloat(rating));
          return "★".repeat(num) + "☆".repeat(5 - num);
        }

        // Escapes review text before injecting into innerHTML
        function escapeHtml(str) {
          const div = document.createElement("div");
          div.textContent = str;
          return div.innerHTML;
        }

        const reviewsHtml = filteredReviews.slice(0, 10).map(r => `
          <li class="review-item">
            <div class="review-meta">
              <span class="review-stars">${renderStars(r.rating)}</span>
              ${r.shade ? `<span class="review-shade">Shade: ${escapeHtml(r.shade)}</span>` : ""}
            </div>
            <span class="review-text">${escapeHtml(r.text)}</span>
          </li>
        `).join("");

        const noResults = filteredReviews.length === 0
          ? `<p class="no-results">No reviews matched "${escapeHtml(query)}".</p>`
          : "";

        // Render product info + reviews, then kick off YouTube fetch below
        summaryBox.innerHTML = `
          <div class="product-info">
            <strong class="product-name">${escapeHtml(data.productName || "Unknown Product")}</strong>
            <span class="product-brand">Brand: ${escapeHtml(data.brand || "N/A")}</span>
            <span class="product-price">Price: ${escapeHtml(data.price || "N/A")}</span>
          </div>
          <div class="reviews-section">
            <strong class="reviews-heading">Top Reviews:</strong>
            ${noResults}
            <ul class="review-list">${reviewsHtml}</ul>
          </div>
          <div id="youtubeBox">
            <p style="font-size: 0.8em; opacity: 0.6;">Loading YouTube reviews...</p>
          </div>
        `;

        // Once Sephora reviews are rendered, fetch YouTube evidence in the background
        const youtubeBox = document.getElementById("youtubeBox");
        try {
          const res = await fetch("http://localhost:5001/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productName: data.productName,
              brand: data.brand,
              onPageRating: data.onPageRating,
              onPageReviews: data.reviews
            })
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `Server error ${res.status}`);
          }

          const youtubeData = await res.json();
          renderYouTubeResults(youtubeBox, data.productName, youtubeData.youtubeEvidence);

        } catch (err) {
          youtubeBox.innerHTML = `<p class="yt-error">YouTube fetch failed: ${escapeHtml(err.message)}</p>`;
        }
      });

    } catch (err) {
      summaryBox.innerHTML = `<p>Unexpected error: ${err.message}</p>`;
    }
  });
});


// YOUTUBE RENDERING

function renderYouTubeResults(box, productName, evidence) {
  if (!evidence) {
    box.innerHTML = `<p class="yt-error">No YouTube evidence returned.</p>`;
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
      const transcriptTag = v.transcriptChunks?.length > 0
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
    html += `
      <details class="yt-rejected">
        <summary>${rejectionReasons.length} rejected video(s)</summary>
        <ul>
          ${rejectionReasons.map(r => `<li><strong>${escapeHtml(r.title || r.videoId)}</strong>: ${escapeHtml(r.reason)}</li>`).join("")}
        </ul>
      </details>`;
  }

  box.innerHTML = html;
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