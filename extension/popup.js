document.addEventListener("DOMContentLoaded", () => {
  const summarizeBtn = document.getElementById("summarizeBtn");
  const summaryBox = document.getElementById("summaryBox");
  const searchInput = document.getElementById("search");

  let showSummary = false;

  summarizeBtn.addEventListener("click", () => {
    showSummary = !showSummary;

    if (showSummary) {
      summaryBox.classList.remove("hidden");

      const query = searchInput.value.trim();

      if (query) {
        summaryBox.innerHTML = `
          <p class="summary-text">
            Summary for: <strong>${escapeHtml(query)}</strong>
          </p>
        `;
      } else {
        summaryBox.innerHTML = `
          <p class="summary-text">Summary will appear here...</p>
        `;
      }
    } else {
      summaryBox.classList.add("hidden");
    }
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
});