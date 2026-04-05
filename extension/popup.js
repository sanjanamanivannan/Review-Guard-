// SHARED HELPERS — defined first so every function below can use them

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}


document.addEventListener("DOMContentLoaded", () => {

  const summarizeBtn = document.getElementById("summarizeBtn");
  const summaryBox   = document.getElementById("summaryBox");
  const geminiBox    = document.getElementById("geminiBox");
  const searchInput  = document.getElementById("search");

  summarizeBtn.addEventListener("click", async () => {

    summaryBox.classList.remove("hidden");
    geminiBox.classList.remove("hidden");
    summaryBox.innerHTML = `
      <p>Gathering reviews across all pages...</p>
      <p style="font-size: 0.8em; opacity: 0.6;">This may take a few seconds</p>`;
    geminiBox.innerHTML = `
      <p style="font-size: 0.8em; opacity: 0.6;">Analyzing with AI...</p>`;

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

        // Render product info + reviews, then kick off YouTube + Gemini fetch below
        // Render product info + Sephora reviews
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

        // Once on-page reviews are rendered, fetch YouTube + Gemini rating
        // Fetch YouTube + Gemini from the backend
        const youtubeBox = document.getElementById("youtubeBox");
        try {
          const res = await fetch("http://localhost:5001/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productName: data.productName,
              brand: data.brand,
              onPageRating: data.onPageRating,
              pageReviews: (data.reviews || []).map(r => r.text),
            })
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `Server error ${res.status}`);
          }

          const youtubeData = await res.json();
          renderYouTubeResults(youtubeBox, data.productName, youtubeData);
          const result = await res.json();

          // Render Gemini recommendation at the top
          renderGeminiResult(geminiBox, result);

          // Render YouTube links below the reviews
          renderYouTubeResults(youtubeBox, data.productName, result.youtubeEvidence);

        } catch (err) {
          geminiBox.innerHTML = `<p class="yt-error">AI analysis failed: ${escapeHtml(err.message)}</p>`;
          if (document.getElementById("youtubeBox")) {
            document.getElementById("youtubeBox").innerHTML = `<p class="yt-error">YouTube fetch failed: ${escapeHtml(err.message)}</p>`;
          }
        }
      });

    } catch (err) {
      summaryBox.innerHTML = `<p>Unexpected error: ${err.message}</p>`;
    }
  });
});


// YOUTUBE + GEMINI RENDERING
// GEMINI RESULT RENDERING

function renderGeminiResult(box, result) {
  if (!result || !result.rating) {
    box.innerHTML = `<p class="yt-error">No AI recommendation returned.</p>`;
    return;
  }

  const ratingColor = {
    "Highly Recommended": "score-high",
    "Recommended": "score-mid",
    "Mixed": "score-low",
    "Not Recommended": "score-low"
  }[result.rating] || "score-mid";

  const pros = (result.pros || []).map(p => `<li>${escapeHtml(p)}</li>`).join("");
  const cons = (result.cons || []).map(c => `<li>${escapeHtml(c)}</li>`).join("");

  box.innerHTML = `
    <div class="gemini-header">
      <span class="gemini-label">AI Recommendation</span>
      <span class="gemini-rating ${ratingColor}">${escapeHtml(result.rating)}</span>
    </div>

    ${result.evidenceSummary ? `
      <p class="gemini-summary">${escapeHtml(result.evidenceSummary)}</p>
    ` : ""}

    <div class="gemini-pros-cons">
      ${pros ? `
        <div class="gemini-pros">
          <strong>Pros</strong>
          <ul>${pros}</ul>
        </div>
      ` : ""}
      ${cons ? `
        <div class="gemini-cons">
          <strong>Cons</strong>
          <ul>${cons}</ul>
        </div>
      ` : ""}
    </div>

    ${result.bestFor ? `
      <p class="gemini-best-for"><strong>Best for:</strong> ${escapeHtml(result.bestFor)}</p>
    ` : ""}

    ${result.onSiteVsExternalGap ? `
      <p class="gemini-gap"><strong>Sephora vs YouTube:</strong> ${escapeHtml(result.onSiteVsExternalGap)}</p>
    ` : ""}
  `;
}


// YOUTUBE RENDERING

function renderYouTubeResults(box, productName, data) {
  if (!data) {
    box.innerHTML = `<p class="yt-error">No results returned.</p>`;
    return;
  }

  const { rating, score, pros, cons, evidenceSummary, onSiteVsExternalGap, youtubeEvidence } = data;
  const evidence = youtubeEvidence || {};
  const { videos = [], totalVideosChecked = 0, totalVideosRejected = 0, rejectionReasons = [] } = evidence;

  let html = "";

  // ── Gemini Rating ──
  if (rating) {
    const ratingColor = {
      "Highly Recommended": "#16a34a",
      "Recommended": "#2563eb",
      "Mixed": "#d97706",
      "Not Recommended": "#dc2626"
    }[rating] || "#6b7280";

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

  // ── YouTube results ──
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

      html += `
        <div class="yt-card">
          <div class="yt-card-top">
            <span class="yt-score ${scoreClass}">${v.credibilityScore}</span>
            <a class="yt-video-title" href="https://youtube.com/watch?v=${escapeHtml(v.videoId)}" target="_blank">${escapeHtml(v.title)}</a>
          </div>
          <div class="yt-card-meta">
            <span>${formatNumber(v.viewCount)} views · ${formatNumber(v.likeCount)} likes · ${(v.likeToViewRatio * 100).toFixed(1)}% ratio</span>
          </div>
          ${sponsoredTag ? `<div class="yt-tags">${sponsoredTag}</div>` : ""}
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
}
