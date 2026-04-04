
// The content script runs inside a web page and lets your extension interact with that page’s content.

// Think of it as a bridge between your extension and the website.
// Listen for messages sent from other parts of the Chrome extension (e.g., background or popup)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Check if the message is requesting reviews from the page
  if (message.type === "GET_REVIEWS") {

    // Select all paragraph, span, and div elements from the page
    const reviewEls = document.querySelectorAll("p, span, div");

    // Convert NodeList to an array and process the elements
    const reviews = Array.from(reviewEls)
      // Extract and trim the visible text content from each element
      .map((el) => el.innerText.trim())
      // Filter out short or irrelevant text (only keep text longer than 20 characters)
      .filter((text) => text.length > 20)
      // Limit the results to the first 20 items
      .slice(0, 20);

    // Send the extracted reviews back to the sender (e.g., popup or background script)
    sendResponse({ reviews });
  }

  // Return true to indicate the response will be sent asynchronously
  return true;
});