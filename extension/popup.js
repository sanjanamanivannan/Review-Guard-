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
    }
  });

});