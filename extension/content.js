// CONTENT SCRIPT
// Runs on the product page. popup.js sends a message here,
// we scrape the page and send the data back.


// BLOCKLIST
// Any element matching these selectors — or with a parent that does —
// gets skipped. Keeps ads, navbars, and footers out of our results.
const EXCLUDE_SELECTORS = [
  '[class*="ad"]',
  '[class*="sponsored"]',
  '[class*="banner"]',
  '[class*="promo"]',
  '[class*="recommendation"]',
  '[class*="suggested"]',
  '[class*="carousel"]',
  '[class*="upsell"]',
  '[aria-label*="advertisement"]',
  'iframe',
  'aside',
  'header',
  'footer',
  'nav'
];

// Walks up the DOM from el — returns true if el or any parent is blocked
function isExcluded(el) {
  let node = el;
  while (node && node !== document.body) {
    for (const selector of EXCLUDE_SELECTORS) {
      if (node.matches?.(selector)) return true;
    }
    node = node.parentElement;
  }
  return false;
}


// TEXT HELPERS

// Returns trimmed text content of an element, or "" if el is null
function getText(el) {
  return el ? el.textContent.trim() : "";
}

// Collapses multiple spaces/newlines into one space
function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

// Cleans an array of strings and removes duplicates
function uniqueStrings(arr) {
  return [...new Set(arr.map(item => cleanText(item)).filter(Boolean))];
}

// Tries each selector in order, returns text of the first match
function queryText(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && getText(el)) return getText(el);
  }
  return "";
}

// Returns text from ALL elements matching any selector, skipping blocked ones
function queryAllText(selectors) {
  const results = [];
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (isExcluded(el)) return;
      const text = getText(el);
      if (text) results.push(text);
    });
  }
  return uniqueStrings(results);
}


// SEPHORA SELECTORS
// Scoping everything to #ratings-reviews-container means we only ever
// touch the reviews section — never carousels or product info above it.
// The trailing spaces in "BaseComponent " and "StarRating " are real —
// that's how Sephora writes their data-comp attributes.
const REVIEWS_CONTAINER    = '#ratings-reviews-container';
const REVIEW_CARD_SELECTOR = `${REVIEWS_CONTAINER} [data-comp*="Review Review BaseComponent"]`;
const REVIEW_TEXT_SELECTOR = '[data-comp="BaseComponent "]';


// PAGE CHANGE DETECTION
// After clicking Next, polls every 200ms until the first review's text
// changes — that's our signal that the new page has loaded.
function waitForNewReviews(previousFirstReviewText) {
  return new Promise((resolve) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 25; // 5 seconds max before giving up

    const interval = setInterval(() => {
      attempts++;

      const reviewEls = document.querySelectorAll(REVIEW_CARD_SELECTOR);

      // Read the first review's text to compare against the snapshot
      const firstReview = reviewEls[0];
      const firstDirectText = firstReview
        ? Array.from(firstReview.querySelectorAll(REVIEW_TEXT_SELECTOR))
            .map((div) =>
              Array.from(div.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent.trim())
                .join(" ")
                .trim()
            )
            .find((t) => t.length > 40) || ""
        : "";

      const pageChanged  = firstDirectText !== previousFirstReviewText && firstDirectText.length > 0;
      const hasEnough    = reviewEls.length >= 3; // guard against half-loaded pages
      const timedOut     = attempts >= MAX_ATTEMPTS;

      if ((pageChanged && hasEnough) || timedOut) {
        clearInterval(interval);
        setTimeout(resolve, 300); // small buffer for DOM to fully settle
      }
    }, 200);
  });
}


// PAGINATION LOOP
// Scrapes the current page, clicks Next, waits, repeats up to maxPages times.
async function scrapeAllPages(maxPages = 5) {
  const allReviews = [];

  for (let page = 0; page < maxPages; page++) {

    // Scrape whatever reviews are visible right now
    const pageReviews = extractPairedReviews();
    allReviews.push(...pageReviews);

    // Find the Next button — stop if it's gone or disabled (last page)
    const nextBtn = document.querySelector(
      'button[aria-label="Next page"]:not([disabled]), ' +
      '.pr-pagination-next:not([disabled]), ' +
      '.bv-content-pagination-buttons-item-next:not([disabled])'
    );
    if (!nextBtn) break;

    // Snapshot the first review's text before clicking so we can
    // detect when the next page has actually loaded
    const firstReviewEl = document.querySelector(REVIEW_CARD_SELECTOR);
    const previousFirstReviewText = firstReviewEl
      ? Array.from(firstReviewEl.querySelectorAll(REVIEW_TEXT_SELECTOR))
          .map((div) =>
            Array.from(div.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent.trim())
              .join(" ")
              .trim()
          )
          .find((t) => t.length > 40) || ""
      : "";

    nextBtn.click();
    await waitForNewReviews(previousFirstReviewText);
  }

  // Remove any reviews that appeared on both page N and page N+1
  const seen = new Set();
  return allReviews.filter((r) => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  });
}


// MAIN DATA EXTRACTOR
// Runs pagination, falls back to single-page scrape if that returns nothing
async function extractProductData() {
  const reviews = await scrapeAllPages(2);
  const finalReviews = reviews.length > 0 ? reviews : extractReviewTextFallback();

  return {
    url: window.location.href,
    source: 'dom-scrape',
    productName: extractProductName(),
    brand: extractBrand(),
    price: extractPrice(),
    reviews: finalReviews,
    scrapedAt: new Date().toISOString()
  };
}

// Sephora stores the name as an attribute value, not text content
function extractProductName() {
  // Sephora stores the product name in a span with data-at="product_name"
  const sephoraNameEl = document.querySelector('[data-at="product_name"]');
  if (sephoraNameEl) return cleanText(getText(sephoraNameEl));

  // Fallback: check data-cnstrc-item-name attribute
  const sephoraEl = document.querySelector('[data-cnstrc-item-name]');
  if (sephoraEl) {
    const attrVal = sephoraEl.getAttribute('data-cnstrc-item-name');
    if (attrVal) return cleanText(attrVal);
  }

  return queryText([
    '[data-testid="product-name"]',
    '[data-testid="product-title"]',
    'h1[class*="ProductName"]',
    'h1[class*="product"]',
    '.product-title',
    'h1'
  ]);
}

function extractBrand() {
  // Sephora stores the brand in an anchor with data-at="brand_name"
  const sephoraBrandEl = document.querySelector('[data-at="brand_name"]');
  if (sephoraBrandEl) return cleanText(getText(sephoraBrandEl));

  const selectors = [
    '[data-testid="brand-name"]',
    '[data-testid="brand"]',
    '.brand-name',
    '.product-brand',
    '#bylineInfo',
    'meta[name="brand"]'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    if (el.tagName === "META") {
      const content = el.getAttribute("content");
      if (content) return cleanText(content);
    } else {
      const text = getText(el);
      if (text) return text;
    }
  }

  const brandMatch = document.body.innerText.match(/brand[:\s]+([A-Za-z0-9&' -]+)/i);
  return brandMatch ? cleanText(brandMatch[1]) : "";
}

function extractPrice() {
  const selectors = [
    '[data-testid="product-price"]',
    '[data-testid="price"]',
    '.price',
    '.product-price',
    '.sales-price',
    '.a-price .a-offscreen',
    '[itemprop="price"]'
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    if (el.tagName === "META") {
      const content = el.getAttribute("content");
      if (content) return cleanText(content);
    } else {
      const text = getText(el);
      if (text) return text;
    }
  }
  // Last resort: scan for a currency symbol followed by digits
  const priceMatch = document.body.innerText.match(/(\$|£|€)\s?\d+(?:[.,]\d{2})?/);
  return priceMatch ? priceMatch[0] : "";
}


// REVIEW QUALITY FILTER
// Rejects text that looks like website UI and accepts text that looks
// like a real human wrote it about a product they used.
function isLikelyRealReview(text) {
  const lower = text.toLowerCase();

  const JUNK_SIGNALS = [
    'sign in', 'log in', 'add to cart', 'free shipping',
    'shop now', 'learn more', 'privacy policy', 'cookie',
    'advertisement', 'sponsored', 'terms of service',
    'subscribe', 'newsletter', 'follow us', 'view all',
    'sort by', 'filter', 'write a review',
    'helpful?', 'skin tone', 'see it in real life', 'mention @sep',
    'verified purchase', 'i received this product in exchange',
    'd ago', 'read more'
  ];

  const REVIEW_SIGNALS = [
    'love', 'great', 'works', 'skin', 'shade', 'color', 'colour',
    'smell', 'texture', 'recommend', 'purchased', 'bought',
    'long lasting', 'broke out', 'sensitive', 'formula',
    'coverage', 'pigment', 'blend', 'apply', 'wear'
  ];

  if (text.length < 40) return false;
  if (JUNK_SIGNALS.some(signal => lower.includes(signal))) return false;
  return REVIEW_SIGNALS.some(signal => lower.includes(signal)) || text.length > 100;
}


// REVIEW + RATING EXTRACTOR
// Pulls review text and star rating together from each review card.
function extractPairedReviews() {
  const containers = document.querySelectorAll(REVIEW_CARD_SELECTOR);
  const paired = [];

  containers.forEach(container => {
    if (isExcluded(container)) return;

    // Review text is a raw text node inside a div[data-comp="BaseComponent "]
    // We skip divs that contain UI noise like voting buttons or metadata
    let text = "";
    const baseComponents = container.querySelectorAll(REVIEW_TEXT_SELECTOR);
    for (const div of baseComponents) {
      const directText = Array.from(div.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .join(" ")
        .trim();

      const isUiNoise = /helpful\?|skin tone|eye color|skin type|\d+ d ago|\d+\|\(\d+\)/i.test(directText);

      if (directText.length > 40 && !isUiNoise) {
        text = cleanText(directText);
        break;
      }
    }

    // Star rating lives in <span data-comp="StarRating " aria-label="4 stars">
    let rating = null;
    const ratingEl = container.querySelector('[data-comp="StarRating "]');
    if (ratingEl) {
      const aria = ratingEl.getAttribute('aria-label') || "";
      const match = aria.match(/^(\d(?:\.\d)?)\s+stars?$/i);
      rating = match ? match[1] : null;
    }

    // Shade is Sephora-specific e.g. "300 Medium Neutral"
    const shadeEl = container.querySelector('.css-qbt5ty');
    const shade = shadeEl ? cleanText(getText(shadeEl)) : null;

    if (text && isLikelyRealReview(text)) {
      paired.push({ text, rating, shade });
    }
  });

  // If Sephora selectors found nothing, try Ulta and Cult Beauty
  if (paired.length === 0) {
    const fallbackSelectors = [
      '.pr-review',
      '.bv-content-review',
      '.review-item',
      '[class*="review-tile"]'
    ];

    for (const selector of fallbackSelectors) {
      const fallbackContainers = document.querySelectorAll(selector);
      if (fallbackContainers.length === 0) continue;

      fallbackContainers.forEach(container => {
        if (isExcluded(container)) return;

        const textEl = container.querySelector(
          '.pr-rd-description-text, .bv-content-summary-body-text, [itemprop="reviewBody"], p'
        );
        const text = textEl ? cleanText(getText(textEl)) : "";

        let rating = null;
        const allEls = container.querySelectorAll('[aria-label]');
        for (const el of allEls) {
          const aria = el.getAttribute('aria-label') || "";
          const match = aria.match(/(\d(?:\.\d)?)\s+stars?/i);
          if (match) { rating = match[1]; break; }
        }

        if (text && isLikelyRealReview(text)) {
          paired.push({ text, rating, shade: null });
        }
      });

      if (paired.length > 0) break;
    }
  }

  return paired.slice(0, 20);
}


// FALLBACK EXTRACTOR
// Used when extractPairedReviews finds nothing — broader search,
// no rating data, but better than returning empty.
function extractReviewTextFallback() {
  const reviewSelectors = [
    '[data-testid="review-text"]',
    '[data-testid="reviewText"]',
    '[class*="ReviewBody"]',
    '[class*="ReviewText"]',
    '.pr-rd-description-text',
    '.pr-review-main-footer',
    '.bv-content-summary-body-text',
    '.bv-content-body',
    '.yotpo-review-wrapper .yotpo-review-content',
    '[data-testid*="review"]',
    '.review-text',
    '.review-content',
    '.review-body',
    '.ugc-review',
    '.jdgm-rev__body',
    '[itemprop="reviewBody"]'
  ];

  let reviews = queryAllText(reviewSelectors);

  if (reviews.length === 0) {
    // Last resort: grab any <p> tag that passes the review quality filter
    const paragraphs = Array.from(document.querySelectorAll("p"))
      .filter(p => !isExcluded(p))
      .map(p => getText(p))
      .filter(isLikelyRealReview);
    reviews = uniqueStrings(paragraphs);
  }

  return reviews.slice(0, 20).map(text => ({ text, rating: null }));
}


// SCROLL TRIGGER
// Reviews are lazy-loaded — they don't exist in the DOM until the user
// scrolls to them. We scroll there and wait 1.5s before scraping.
async function scrollToReviews() {
  return new Promise((resolve) => {
    const reviewSection = document.querySelector(
      '#ratings-reviews-container, [data-testid="reviews-section"], .pr-review-snapshot, .bv-ratings-summary'
    );

    if (reviewSection) {
      reviewSection.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }

    setTimeout(resolve, 1500);
  });
}


// MESSAGE LISTENER
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_PRODUCT_DATA") {

    // 1. Wrapped in an async IIFE because addListener's callback can't be
    //    declared async directly — Chrome ignores the returned Promise, which
    //    would cause the message channel to close before sendResponse is called.
    (async () => {

      // 2. scrollToReviews is awaited first so lazy-loaded reviews are in the
      //    DOM before we start scraping — without this, extractProductData runs
      //    while the review section is still empty.
      await scrollToReviews();

      // 3. extractProductData is async (it calls scrapeAllPages which clicks
      //    through pages and waits for each one to load), so we must await it —
      //    otherwise sendResponse fires instantly with an unresolved Promise
      //    instead of the actual scraped data.
      const data = await extractProductData();
      sendResponse({ success: true, data });
    })();

    return true;
  }
});