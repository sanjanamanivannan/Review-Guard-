chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_REVIEWS") {
      const reviewEls = document.querySelectorAll("p, span, div");
  
      const reviews = Array.from(reviewEls)
        .map((el) => el.innerText.trim())
        .filter((text) => text.length > 20)
        .slice(0, 20);
  
      sendResponse({ reviews });
    }
  
    return true;
  });