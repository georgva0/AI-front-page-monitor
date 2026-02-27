require("dotenv").config();
process.env.PLAYWRIGHT_BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH || "0";
const express = require("express");
const { chromium } = require("playwright");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const {
  analyzeScreenshot,
  analyzeUpdateFrequency,
  analyzeSentiment,
  analyzeCoverageComparison,
  analyzeAudienceFit,
  rewriteForSocialMedia,
  askQuestionAboutFrontPageStream,
} = require("./gemini");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Allow requests from our React frontend
app.use(express.json());

// Serve static files from Screengrabs directory
app.use("/screengrabs", express.static(path.join(__dirname, "Screengrabs")));

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

  console.log(`[${requestId}] ========== CAPTURE REQUEST START ==========`);
  console.log(`[${requestId}] Service: ${serviceName}`);
  console.log(`[${requestId}] URL: ${url}`);
  console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`);

  let browser = null;

  // Set a response timeout of 120 seconds max
  const responseTimeout = setTimeout(() => {
    console.log(
      `[${requestId}] ⚠️ TIMEOUT: Response timeout triggered after 120 seconds`,
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
    const launchOptions = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    };
    if (process.env.CHROMIUM_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
    }

    try {
      browser = await chromium.launch(launchOptions);
    } catch (launchError) {
      console.log(
        `[${requestId}] Primary launch failed, retrying with Playwright bundled Chromium: ${launchError.message}`,
      );
      browser = await chromium.launch({
        ...launchOptions,
        executablePath: chromium.executablePath(),
      });
    }
    console.log(`[${requestId}] ✓ Browser launched`);

    // Create browser context with user agent
    console.log(`[${requestId}] Creating browser context...`);
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1024, height: 768 },
      locale: "en-GB",
      timezoneId: "Europe/London",
    });
    console.log(`[${requestId}] ✓ Context created`);

    // Block common ad/tracking network requests to keep captures cleaner
    const blockedHosts = [
      "doubleclick.net",
      "googlesyndication.com",
      "googleadservices.com",
      "adservice.google.com",
      "securepubads.g.doubleclick.net",
      "adnxs.com",
      "criteo.com",
      "taboola.com",
      "outbrain.com",
      "facebook.net",
      "ads-twitter.com",
      "scorecardresearch.com",
      "quantserve.com",
      "amazon-adsystem.com",
    ];

    await context.route("**/*", (route) => {
      const requestUrl = route.request().url();
      if (blockedHosts.some((host) => requestUrl.includes(host))) {
        return route.abort();
      }
      return route.continue();
    });
    console.log(`[${requestId}] ✓ Ad/tracker request blocking enabled`);

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
        `[${requestId}] ⚠️ Navigation timeout/error, proceeding: ${err.message}`,
      );
    }

    // Give the page just 1 second to render
    console.log(`[${requestId}] Waiting for render...`);
    await page.waitForTimeout(1000);
    console.log(`[${requestId}] ✓ Render wait complete`);

    // Click the cookie consent button using the data-cookie-banner attribute
    console.log(`[${requestId}] Attempting to click cookie consent button...`);
    try {
      // Wait for page to settle
      await page.waitForTimeout(2000);

      // Debug: Log button existence
      const buttonExists = await page.evaluate(() => {
        const btn = document.querySelector('[data-cookie-banner="accept"]');
        return !!btn;
      });
      console.log(`[${requestId}] Button exists: ${buttonExists}`);

      // Method 1: Try direct click via page.click()
      try {
        await page.click('[data-cookie-banner="accept"]', {
          timeout: 3000,
          force: true,
        });
        console.log(`[${requestId}] ✓ Button clicked via page.click()`);
        await page.waitForTimeout(2000);
      } catch (clickErr) {
        console.log(`[${requestId}] page.click() failed: ${clickErr.message}`);

        // Method 2: Click via evaluate with scrollIntoView
        const clicked = await page.evaluate(() => {
          const btn = document.querySelector('[data-cookie-banner="accept"]');
          if (btn) {
            btn.scrollIntoView({ behavior: "instant", block: "center" });
            btn.click();
            return true;
          }
          return false;
        });

        if (clicked) {
          console.log(`[${requestId}] ✓ Button clicked via evaluate`);
          await page.waitForTimeout(2000);
        } else {
          console.log(
            `[${requestId}] ℹ️ Button not found with selector, trying to hide banner...`,
          );

          // Method 3: Hide via multiple aggressive CSS approaches
          await page.evaluate(() => {
            // Try to hide all common cookie banner elements
            const bannersSelectors = [
              "[data-cookie-banner]",
              '[class*="cookie-banner"]',
              '[class*="cookie"]',
              '[id*="cookie"]',
              '[class*="consent"]',
              '[id*="consent"]',
              '[role="dialog"]',
              ".bbc-m6b7yc", // BBC specific
            ];

            bannersSelectors.forEach((selector) => {
              try {
                document.querySelectorAll(selector).forEach((el) => {
                  el.style.display = "none !important";
                  el.style.visibility = "hidden !important";
                  el.style.opacity = "0 !important";
                  el.style.pointerEvents = "none !important";
                  el.setAttribute("aria-hidden", "true");
                });
              } catch (e) {
                // Ignore selector errors
              }
            });
          });
          console.log(`[${requestId}] ✓ Cookie banners hidden via CSS`);
          await page.waitForTimeout(1000);
        }
      }
    } catch (e) {
      console.log(`[${requestId}] ⚠️ Cookie handling error: ${e.message}`);
    }

    // Remove visible ad containers/placeholders before screenshot
    try {
      await page.evaluate(() => {
        const isNeutralGray = (background) => {
          const match = background.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
          if (!match) return false;
          const red = Number(match[1]);
          const green = Number(match[2]);
          const blue = Number(match[3]);
          return (
            Math.abs(red - green) <= 12 &&
            Math.abs(green - blue) <= 12 &&
            red >= 180
          );
        };

        const removeAdElements = () => {
          const adSelectors = [
            '[class*="advert"]',
            '[id*="advert"]',
            '[class*="ad-"]',
            '[id^="ad-"]',
            '[id*="ad-slot"]',
            '[class*="ad-slot"]',
            '[data-testid*="ad-slot"]',
            '[class*="dotcom-ad"]',
            '[id*="dotcom-ad"]',
            '[class*="bbccom_ads"]',
            '[id*="bbccom_ads"]',
            '[class*="commercial"]',
            '[id*="commercial"]',
            '[class*="sponsor"]',
            '[id*="sponsor"]',
            '[aria-label*="Publicidad"]',
            '[aria-label*="Advertisement"]',
            '[aria-label*="Anuncio"]',
            '[id*="google_ads"]',
            '[class*="google-ad"]',
            '[data-component="advert"]',
            '[data-component*="advert"]',
            '[data-testid*="advert"]',
            '[data-e2e*="advert"]',
            "iframe[src*='doubleclick']",
            "iframe[src*='googlesyndication']",
            "iframe[src*='adservice']",
          ];

          adSelectors.forEach((selector) => {
            try {
              document.querySelectorAll(selector).forEach((el) => {
                const parent = el.parentElement;
                el.remove();

                if (!parent) return;
                const parentText = (parent.textContent || "")
                  .replace(/\s+/g, " ")
                  .trim();
                const parentMedia = parent.querySelector(
                  "img, picture, video, canvas, svg, iframe",
                );
                const parentRect = parent.getBoundingClientRect();

                if (
                  !parentMedia &&
                  parentText.length < 16 &&
                  parentRect.height >= 120 &&
                  parentRect.width >= 300
                ) {
                  parent.remove();
                }
              });
            } catch {
              // Ignore selector issues
            }
          });
        };

        removeAdElements();

        // Remove large, empty placeholder blocks often left after ad scripts are blocked
        const candidates = document.querySelectorAll("div, section, aside");
        candidates.forEach((el) => {
          try {
            const rect = el.getBoundingClientRect();
            if (rect.height < 120 || rect.width < 250) {
              return;
            }

            const hasMedia =
              el.querySelector("img, picture, video, canvas, svg, iframe") !==
              null;
            const hasInteractive =
              el.querySelector("a, button, input, select, textarea") !== null;
            const visibleText = (el.textContent || "").replace(/\s+/g, " ").trim();

            if (hasMedia || hasInteractive || visibleText.length > 12) {
              return;
            }

            const style = window.getComputedStyle(el);
            const background = style.backgroundColor || "";
            if (isNeutralGray(background)) {
              el.remove();
            }
          } catch {
            // Ignore per-element errors
          }
        });
      });

      // Run one more pass after a short delay to catch late ad placeholders
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        const adSelectors = [
          '[class*="advert"]',
          '[id*="advert"]',
          '[class*="ad-"]',
          '[id^="ad-"]',
          '[class*="ad-slot"]',
          '[class*="dotcom-ad"]',
          '[data-component*="advert"]',
          '[aria-label*="Publicidad"]',
          '[aria-label*="Advertisement"]',
        ];

        adSelectors.forEach((selector) => {
          try {
            document.querySelectorAll(selector).forEach((el) => {
              el.remove();
            });
          } catch {
            // Ignore selector issues
          }
        });
      });
      console.log(`[${requestId}] ✓ Ad containers removed from page`);
    } catch (adCleanupError) {
      console.log(
        `[${requestId}] ⚠️ Ad cleanup warning: ${adCleanupError.message}`,
      );
    }

    // Construct filename
    const timestamp = getTimestamp();
    const filename = `${serviceName}_${timestamp}.webp`;
    const filepath = path.join(screengrabsDir, filename);

    // Take full page screenshot as JPEG with quality 85
    console.log(`[${requestId}] Taking screenshot...`);
    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: "jpeg",
      quality: 85,
    });

    // Convert to WebP
    await sharp(screenshotBuffer).webp({ quality: 80 }).toFile(filepath);
    console.log(`[${requestId}] ✓ Screenshot taken and converted to WebP`);
    console.log(`[${requestId}] Saved to: ${filepath}`);

    // Keep only the latest capture to limit storage usage
    try {
      const existingFiles = fs.readdirSync(screengrabsDir);
      existingFiles.forEach((existingFile) => {
        const existingPath = path.join(screengrabsDir, existingFile);
        if (existingPath !== filepath && fs.statSync(existingPath).isFile()) {
          fs.unlinkSync(existingPath);
        }
      });
      console.log(`[${requestId}] ✓ Previous captures deleted`);
    } catch (cleanupError) {
      console.log(
        `[${requestId}] ⚠️ Could not fully clean old captures: ${cleanupError.message}`,
      );
    }

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

app.post("/api/analyze", async (req, res) => {
  const { filename, analysisType, serviceName } = req.body;
  const requestId = Date.now();

  if (!filename) {
    return res.status(400).json({ error: "Filename is required" });
  }

  if (!analysisType) {
    return res.status(400).json({ error: "Analysis type is required" });
  }

  console.log(`[${requestId}] ========== AI ANALYSIS REQUEST START ==========`);
  console.log(`[${requestId}] Analysing: ${filename}`);
  console.log(`[${requestId}] Analysis type: ${analysisType}`);
  console.log(
    `[${requestId}] Service/Language: ${serviceName || "not specified"}`,
  );

  try {
    const filepath = path.join(screengrabsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filepath)) {
      console.log(`[${requestId}] ❌ File not found: ${filepath}`);
      return res.status(404).json({ error: "Screenshot file not found" });
    }

    const results = {};

    // Process based on selected analysis type
    if (analysisType === "topFiveSummary") {
      console.log(`[${requestId}] Sending to Gemini for Top 5 Summary...`);
      const analysis = await analyzeScreenshot(filepath);
      console.log(`[${requestId}] ✓ Top 5 Summary completed`);
      results.topFiveSummary = analysis;
    } else if (analysisType === "updatesFrequency") {
      console.log(
        `[${requestId}] Sending to Gemini for Updates frequency analysis...`,
      );
      const frequencyData = await analyzeUpdateFrequency(filepath);
      console.log(`[${requestId}] ✓ Updates frequency completed`);
      results.updatesFrequency = frequencyData;
    } else if (analysisType === "sentimentAnalysis") {
      console.log(`[${requestId}] Sending to Gemini for Sentiment analysis...`);
      const sentimentData = await analyzeSentiment(filepath);
      console.log(`[${requestId}] ✓ Sentiment analysis completed`);
      results.sentimentAnalysis = sentimentData;
    } else if (analysisType === "coverageAnalysis") {
      console.log(`[${requestId}] Sending to Gemini for Coverage Analysis...`);
      const coverageData = await analyzeCoverageComparison(filepath);
      console.log(`[${requestId}] ✓ Coverage Analysis completed`);
      results.coverageAnalysis = coverageData;
    } else if (analysisType === "audienceFitAnalysis") {
      console.log(
        `[${requestId}] Sending to Gemini for Audience Fit Analysis...`,
      );
      const audienceFitData = await analyzeAudienceFit(filepath);
      console.log(`[${requestId}] ✓ Audience Fit Analysis completed`);
      results.audienceFitAnalysis = audienceFitData;
    } else if (analysisType === "socialMediaRewrite") {
      console.log(
        `[${requestId}] Sending to Gemini for Social Media Rewrite...`,
      );
      const socialMediaData = await rewriteForSocialMedia(
        filepath,
        serviceName,
      );
      console.log(`[${requestId}] ✓ Social Media Rewrite completed`);
      results.socialMediaRewrite = socialMediaData;
    }

    console.log(
      `[${requestId}] ========== AI ANALYSIS REQUEST SUCCESS ==========`,
    );

    res.json({
      success: true,
      results: results,
    });
  } catch (error) {
    console.error(`[${requestId}] ❌ ANALYSIS FAILED:`);
    console.error(`[${requestId}] Error:`, error.message);
    console.log(
      `[${requestId}] ========== AI ANALYSIS REQUEST FAILED ==========`,
    );
    res.status(500).json({
      error: "Failed to analyse screenshot",
      details: error.message,
    });
  }
});

app.post("/api/ask-frontpage", async (req, res) => {
  const { filename, question, serviceName } = req.body;
  const requestId = Date.now();

  if (!filename) {
    return res.status(400).json({ error: "Filename is required" });
  }

  if (!question || !question.trim()) {
    return res.status(400).json({ error: "Question is required" });
  }

  console.log(`[${requestId}] ========== FOLLOW-UP QUESTION START ==========`);
  console.log(`[${requestId}] Screenshot: ${filename}`);
  console.log(`[${requestId}] Question: ${question}`);

  try {
    const filepath = path.join(screengrabsDir, filename);

    if (!fs.existsSync(filepath)) {
      console.log(`[${requestId}] ❌ File not found: ${filepath}`);
      return res.status(404).json({ error: "Screenshot file not found" });
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const stream = await askQuestionAboutFrontPageStream(
      filepath,
      question,
      serviceName,
    );

    for await (const chunk of stream) {
      const text = chunk.text();
      if (text) {
        res.write(text);
      }
    }

    console.log(`[${requestId}] ✓ Follow-up answer completed`);
    console.log(
      `[${requestId}] ========== FOLLOW-UP QUESTION SUCCESS ==========`,
    );
    res.end();
  } catch (error) {
    console.error(
      `[${requestId}] ❌ FOLLOW-UP QUESTION FAILED:`,
      error.message,
    );
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Failed to answer follow-up question",
        details: error.message,
      });
    }
    res.write("\n\n[Error generating response. Please try again.]");
    res.end();
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
