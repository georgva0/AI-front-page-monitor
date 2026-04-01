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
const MAX_CAPTURE_HEIGHT = Number(process.env.CAPTURE_MAX_HEIGHT || 5500);
let captureInProgress = false;

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

  if (captureInProgress) {
    return res.status(429).json({
      error: "A capture is already in progress. Please wait a few seconds.",
    });
  }

  captureInProgress = true;

  console.log(`[${requestId}] ========== CAPTURE REQUEST START ==========`);
  console.log(`[${requestId}] Service: ${serviceName}`);
  console.log(`[${requestId}] URL: ${url}`);
  console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`);

  let browser = null;
  let tempJpegPath = null;

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
        "--disable-gpu",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
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
      const resourceType = route.request().resourceType();
      if (["media", "eventsource", "websocket"].includes(resourceType)) {
        return route.abort();
      }

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
    await page.waitForTimeout(600);
    console.log(`[${requestId}] ✓ Render wait complete`);

    // Dismiss cookie/consent banner
    console.log(
      `[${requestId}] Attempting to dismiss cookie consent banner...`,
    );
    try {
      // Wait for page to settle
      await page.waitForTimeout(1200);

      // Try to click the accept button - BBC uses a plain <button> with no id/class,
      // so we search by selector first, then fall back to text-content matching.
      const clicked = await page.evaluate(() => {
        // Common selector-based targets
        const selectorTargets = [
          '[data-cookie-banner="accept"]',
          'button[class*="accept"]',
          'button[id*="accept"]',
        ];
        for (const sel of selectorTargets) {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) {
            btn.click();
            return "selector:" + sel;
          }
        }

        // Text-based fallback: find a visible button whose text looks like acceptance
        const acceptPatterns = [
          /yes,?\s*i\s*agree/i,
          /accept\s*(all|cookies)?/i,
          /ok,?\s*i\s*agree/i,
          /agree\s*&\s*close/i,
          /s[íi],?\s*estoy\s*de\s*acuerdo/i, // Spanish
          /acepto/i,
          /accetta/i,
          /agree/i,
        ];
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          if (btn.offsetParent === null) continue;
          const text = (btn.textContent || "").trim();
          if (acceptPatterns.some((re) => re.test(text))) {
            btn.click();
            return "text:" + text.substring(0, 40);
          }
        }
        return null;
      });

      if (clicked) {
        console.log(`[${requestId}] ✓ Cookie accept clicked (${clicked})`);
        await page.waitForTimeout(1000);
      } else {
        console.log(
          `[${requestId}] ℹ️ Accept button not found, hiding banner via CSS...`,
        );

        // Fallback: hide all known cookie/consent banner containers
        await page.evaluate(() => {
          const bannerSelectors = [
            "[data-cookie-banner]",
            '[class*="cookie-banner"]',
            '[class*="cookie"]',
            '[id*="cookie"]',
            '[class*="consent"]',
            '[id*="consent"]',
            '[role="dialog"]',
            ".bbc-m6b7yc",
            ".e1scntac0", // BBC consent dialog (2025+)
          ];
          bannerSelectors.forEach((selector) => {
            try {
              document.querySelectorAll(selector).forEach((el) => {
                el.style.setProperty("display", "none", "important");
                el.style.setProperty("visibility", "hidden", "important");
                el.style.setProperty("opacity", "0", "important");
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
            const visibleText = (el.textContent || "")
              .replace(/\s+/g, " ")
              .trim();

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
      await page.waitForTimeout(700);
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

    // Ensure multilingual glyph support (including CJK) before screenshot
    try {
      await page.addStyleTag({
        content: `
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');

          html, body, body * {
            font-family: "Noto Sans JP", "Noto Sans SC", "Noto Sans", Arial, sans-serif !important;
          }
        `,
      });

      await page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) {
          try {
            await Promise.race([
              document.fonts.ready,
              new Promise((resolve) => setTimeout(resolve, 3000)),
            ]);
          } catch {
            // Ignore font readiness issues
          }
        }
      });
      console.log(
        `[${requestId}] ✓ Fallback fonts applied for multilingual text`,
      );
    } catch (fontError) {
      console.log(
        `[${requestId}] ⚠️ Font fallback warning: ${fontError.message}`,
      );
    }

    // Construct filename
    const timestamp = getTimestamp();
    const filename = `${serviceName}_${timestamp}.webp`;
    const filepath = path.join(screengrabsDir, filename);
    tempJpegPath = path.join(screengrabsDir, `${serviceName}_${timestamp}.jpg`);

    // Take full page screenshot directly to disk to reduce Node memory usage
    console.log(`[${requestId}] Taking screenshot...`);
    await page.screenshot({
      path: tempJpegPath,
      fullPage: true,
      type: "jpeg",
      quality: 72,
      animations: "disabled",
    });

    // Convert to WebP and cap image height to reduce memory/storage pressure
    await sharp(tempJpegPath)
      .resize({
        height: MAX_CAPTURE_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 70, effort: 4 })
      .toFile(filepath);

    if (fs.existsSync(tempJpegPath)) {
      fs.unlinkSync(tempJpegPath);
    }

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
    captureInProgress = false;
    if (browser) {
      console.log(`[${requestId}] Closing browser...`);
      await browser.close();
      console.log(`[${requestId}] ✓ Browser closed`);
    }
    if (tempJpegPath && fs.existsSync(tempJpegPath)) {
      fs.unlinkSync(tempJpegPath);
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
        // Dismiss cookie/consent banner
        console.log(
          `[${requestId}] Attempting to dismiss cookie consent banner...`,
        );
        try {
          // Wait for page to settle
          await page.waitForTimeout(1200);

          // Try to click the accept button.
          // BBC uses a plain <button> with no id/class — use structural and text-based targeting.
          const clicked = await page.evaluate(() => {
            // 1. Attribute-based selectors (older BBC pattern)
            const selectorTargets = [
              '[data-cookie-banner="accept"]',
              'button[class*="accept"]',
              'button[id*="accept"]',
              // BBC consent action list: first <li> always contains the accept button
              ".e1scntac3 li:first-child button",
              ".e1scntac5 button",
            ];
            for (const sel of selectorTargets) {
              const btn = document.querySelector(sel);
              if (btn && btn.offsetParent !== null) {
                btn.click();
                return "selector:" + sel;
              }
            }

            // 2. Text-based fallback covering BBC's multilingual services
            const acceptPatterns = [
              /^i\s*agree$/i,                       // English
              /yes,?\s*i\s*agree/i,
              /accept\s*(all|cookies)?/i,
              /agree\s*&?\s*close/i,
              /s[íi],?\s*estoy\s*de\s*acuerdo/i,   // Spanish
              /acepto/i,
              /sim,?\s*concordo/i,                   // Portuguese
              /concordo/i,
              /accetta/i,                            // Italian
              /j['']?accepte/i,                      // French
              /ich\s*stimme\s*zu/i,                  // German
              /agree/i,                              // catch-all English
            ];
            const buttons = Array.from(document.querySelectorAll("button"));
            for (const btn of buttons) {
              if (btn.offsetParent === null) continue;
              const text = (btn.textContent || "").trim();
              if (acceptPatterns.some((re) => re.test(text))) {
                btn.click();
                return "text:" + text.substring(0, 40);
              }
            }
            return null;
          });

          if (clicked) {
            console.log(`[${requestId}] ✓ Cookie accept clicked (${clicked})`);
            await page.waitForTimeout(1000);
          } else {
            console.log(
              `[${requestId}] ℹ️ Accept button not found`,
            );
          }

          // Always run CSS hide as a safety net — catches any remaining overlay
          // regardless of whether the click succeeded (e.g. dialog re-appears or
          // a second advertising-cookies layer is present).
          await page.evaluate(() => {
            const bannerSelectors = [
              "[data-cookie-banner]",
              '[class*="cookie-banner"]',
              '[class*="cookie"]',
              '[id*="cookie"]',
              '[class*="consent"]',
              '[id*="consent"]',
              '[role="dialog"]',
              ".bbc-m6b7yc",
              ".e1scntac0", // BBC consent dialog container (2025+)
              ".e1scntac1",
            ];
            bannerSelectors.forEach((selector) => {
              try {
                document.querySelectorAll(selector).forEach((el) => {
                  el.style.setProperty("display", "none", "important");
                  el.style.setProperty("visibility", "hidden", "important");
                  el.style.setProperty("opacity", "0", "important");
                  el.setAttribute("aria-hidden", "true");
                });
              } catch (e) {
                // Ignore selector errors
              }
            });
          });
          console.log(`[${requestId}] ✓ Cookie banner CSS hide applied`);
          await page.waitForTimeout(800);
        } catch (e) {
          console.log(`[${requestId}] ⚠️ Cookie handling error: ${e.message}`);
        }
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
