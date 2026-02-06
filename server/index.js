const express = require("express");
const { chromium } = require("playwright");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5000;

// Middleware
app.use(cors()); // Allow requests from our React frontend
app.use(express.json());

// Ensure Screengrabs directory exists
const screengrabsDir = path.join(__dirname, "Screengrabs");
if (!fs.existsSync(screengrabsDir)) {
  fs.mkdirSync(screengrabsDir);
}

/**
 * Helper to format date for filename
 * Returns format: YYYY-MM-DD_HH-mm-ss
 */
const getTimestamp = () => {
  const now = new Date();
  return now
    .toISOString()
    .replace(/T/, "_") // replace T with underscore
    .replace(/\..+/, "") // delete the dot and everything after
    .replace(/:/g, "-"); // replace colons with dashes (safe for filenames)
};

app.post("/api/capture", async (req, res) => {
  const { url, serviceName } = req.body;
  const requestId = Date.now();

  if (!url || !serviceName) {
    return res.status(400).json({ error: "URL and Service Name are required" });
  }

  console.log(
    `[${requestId}] ========== CAPTURE REQUEST START ==========`
  );
  console.log(`[${requestId}] Service: ${serviceName}`);
  console.log(`[${requestId}] URL: ${url}`);
  console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`);

  let browser = null;

  // Set a response timeout of 120 seconds max
  const responseTimeout = setTimeout(() => {
    console.log(
      `[${requestId}] ⚠️ TIMEOUT: Response timeout triggered after 120 seconds`
    );
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "Screenshot capture timed out after 120 seconds" });
    }
  }, 120000);

  try {
    // Launch Playwright
    console.log(`[${requestId}] Launching browser...`);
    browser = await chromium.launch({
      executablePath: "/snap/bin/chromium",
    });
    console.log(`[${requestId}] ✓ Browser launched`);

    // Create browser context with user agent
    console.log(`[${requestId}] Creating browser context...`);
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1024, height: 768 },
    });
    console.log(`[${requestId}] ✓ Context created`);

    console.log(`[${requestId}] Creating new page...`);
    const page = await context.newPage();
    console.log(`[${requestId}] ✓ Page created`);

    // Navigate with a 20-second timeout - if it times out, we still proceed
    console.log(`[${requestId}] Navigating to ${url}...`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      console.log(`[${requestId}] ✓ Navigation completed`);
    } catch (err) {
      console.log(
        `[${requestId}] ⚠️ Navigation timeout/error, proceeding: ${err.message}`
      );
    }

    // Give the page just 1 second to render
    console.log(`[${requestId}] Waiting for render...`);
    await page.waitForTimeout(1000);
    console.log(`[${requestId}] ✓ Render wait complete`);

    // Quick attempt to hide/remove common cookie banners
    console.log(`[${requestId}] Attempting to remove cookie banners...`);
    try {
      await page.evaluate(() => {
        // Remove common cookie/consent elements
        document
          .querySelectorAll(
            '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"]'
          )
          .forEach((el) => el.remove());
      });
      console.log(`[${requestId}] ✓ Cookie banners removed`);
    } catch (e) {
      console.log(`[${requestId}] ℹ️ Cookie removal skipped (not found)`);
    }

    // Construct filename
    const timestamp = getTimestamp();
    const filename = `${serviceName}_${timestamp}.jpg`;
    const filepath = path.join(screengrabsDir, filename);

    // Take full page screenshot as JPEG with quality 85
    console.log(`[${requestId}] Taking screenshot...`);
    await page.screenshot({
      path: filepath,
      fullPage: true,
      type: "jpeg",
      quality: 85,
    });
    console.log(`[${requestId}] ✓ Screenshot taken`);
    console.log(`[${requestId}] Saved to: ${filepath}`);

    clearTimeout(responseTimeout);

    console.log(`[${requestId}] ========== CAPTURE REQUEST SUCCESS ==========`);

    res.json({
      success: true,
      message: "Screenshot captured successfully",
      filename: filename,
    });
  } catch (error) {
    clearTimeout(responseTimeout);
    console.error(`[${requestId}] ❌ CAPTURE FAILED:`);
    console.error(`[${requestId}] Error:`, error.message);
    console.error(`[${requestId}] Stack:`, error.stack);
    console.log(`[${requestId}] ========== CAPTURE REQUEST FAILED ==========`);
    res
      .status(500)
      .json({ error: "Failed to capture screenshot", details: error.message });
  } finally {
    clearTimeout(responseTimeout);
    if (browser) {
      console.log(`[${requestId}] Closing browser...`);
      await browser.close();
      console.log(`[${requestId}] ✓ Browser closed`);
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
