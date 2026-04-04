document.getElementById("analyzeBtn").addEventListener("click", async () => {
    const resultDiv = document.getElementById("result");
    resultDiv.innerText = "Analyzing...";
  
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
      const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_REVIEWS" });
  
      const backendRes = await fetch("http://localhost:5001/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reviews: response.reviews })
      });
  
      const data = await backendRes.json();
  
      resultDiv.innerText = `
  Trust Score: ${data.trustScore}
  Warnings: ${data.warnings.join(", ")}
  Review Count: ${data.reviewCount}
      `;
    } catch (err) {
      console.error(err);
      resultDiv.innerText = "Failed to analyze reviews.";
    }
  });