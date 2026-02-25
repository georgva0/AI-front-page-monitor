const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Initialize the Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Analyzes a screenshot using Gemini Flash 2.0
 * @param {string} imagePath - Path to the screenshot file
 * @returns {Promise<string>} - AI analysis summary
 */
async function analyzeScreenshot(imagePath) {
  try {
    // Get the Gemini 2.5 Flash model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Prepare the image for Gemini
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: "image/webp",
      },
    };

    // Create the prompt
    const prompt = `You are analyzing a screenshot of a BBC news website homepage. This website may be in a language other than English.

EXPLICIT LAYOUT INSTRUCTIONS - FOLLOW EXACTLY:

The page layout follows this EXACT structure:

**LEFT SIDE:**
Article 1 = The LARGE promotional image article on the LEFT side (biggest article with largest image)

**RIGHT SIDE (top to bottom, in 2 columns):**
Article 2 = TOP RIGHT article (first article in right column, upper row)
Article 3 = Second article in TOP ROW (next to Article 2)
Article 4 = Article in SECOND ROW on the right, directly BELOW Article 2
Article 5 = Article in SECOND ROW on the right, directly BELOW Article 3

VISUAL LAYOUT:
┌─────────────────┬──────────┬──────────┐
│                 │ Article 2│ Article 3│
│   Article 1     ├──────────┼──────────┤
│   (LARGE/HERO)  │ Article 4│ Article 5│
└─────────────────┴──────────┴──────────┘

YOU MUST identify articles based on this EXACT spatial layout, NOT by reading order or content importance.

TRANSLATION REQUIREMENTS:
- ALL headlines MUST be translated into English (even if original is in Spanish, Arabic, Hausa, Nepali, Chinese, etc.)
- ALL descriptions MUST be written in English
- You must provide EXACTLY FIVE (5) articles in this exact order

Format your response EXACTLY as follows:

**Article 1:**
[English translation of the LARGE LEFT article headline]
[Brief English description]

**Article 2:**
[English translation of TOP RIGHT article (first in right column)]
[Brief English description]

**Article 3:**
[English translation of TOP ROW second article]
[Brief English description]

**Article 4:**
[English translation of article BELOW Article 2]
[Brief English description]

**Article 5:**
[English translation of article BELOW Article 3]
[Brief English description]

Remember: You must provide all 5 articles and translate everything to English.`;

    // Generate content
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    return text;
  } catch (error) {
    console.error("Error analyzing screenshot with Gemini:", error);
    throw new Error(`Gemini analysis failed: ${error.message}`);
  }
}

module.exports = {
  analyzeScreenshot,
  analyzeUpdateFrequency,
  analyzeSentiment,
  analyzeCoverageComparison,
  analyzeAudienceFit,
  rewriteForSocialMedia,
  askQuestionAboutFrontPageStream,
};

/**
 * Streams an answer to a follow-up question about a captured front page screenshot
 * @param {string} imagePath - Path to the screenshot file
 * @param {string} question - User question
 * @param {string} serviceName - Selected service/language context
 * @returns {Promise<AsyncIterable>} - Gemini text stream chunks
 */
async function askQuestionAboutFrontPageStream(
  imagePath,
  question,
  serviceName = "Unknown",
) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: "image/webp",
      },
    };

    const prompt = `You are helping a user understand a captured news front page screenshot from ${serviceName}.

TASK:
- Answer the user's question about the visible front page content.
- Focus only on what can reasonably be inferred from the screenshot.
- If the answer is not visible or uncertain, clearly say so.
- Keep the response concise, useful, and in plain English.

User question:
${question}`;

    const result = await model.generateContentStream([prompt, imagePart]);
    return result.stream;
  } catch (error) {
    console.error("Error streaming front page follow-up answer:", error);
    throw new Error(`Follow-up question failed: ${error.message}`);
  }
}

/**
 * Analyzes article timestamps in a screenshot to determine update frequency
 * @param {string} imagePath - Path to the screenshot file
 * @returns {Promise<object>} - Update frequency data with counts for each time category
 */
async function analyzeUpdateFrequency(imagePath) {
  try {
    // Get the Gemini 2.5 Flash model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Prepare the image for Gemini
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: "image/webp",
      },
    };

    // Create the prompt
    const prompt = `You are analyzing a screenshot of a news website homepage to categorize articles by their publication timestamps.

TASK:
Look at all visible articles on this page and identify their timestamps (e.g., "2 hours ago", "30 mins ago", "Yesterday", specific dates, etc.).

Categorize each article into ONE of these categories:
1. "Under 1 hour" - articles published less than 1 hour ago (e.g., "30 mins ago", "45 minutes ago")
2. "Under 4 hours" - articles published 1-4 hours ago (e.g., "2 hours ago", "3 hours ago")
3. "Today" - articles published today but more than 4 hours ago (e.g., "5 hours ago", "8 hours ago", or today's date)
4. "Yesterday" - articles published yesterday
5. "Older" - articles published before yesterday

Count how many articles fall into each category.

IMPORTANT:
- Only count articles that have visible timestamps
- If you cannot determine a timestamp, do not count that article
- Return ONLY a valid JSON object, no other text

Return your answer in this EXACT JSON format:
{
  "underOneHour": 5,
  "underFourHours": 3,
  "today": 4,
  "yesterday": 2,
  "older": 6
}

Return ONLY the JSON object, nothing else.`;

    // Generate content
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Parse the JSON response
    try {
      // Remove markdown code blocks if present
      const jsonText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const data = JSON.parse(jsonText);

      // Validate the response has all required fields
      if (
        typeof data.underOneHour !== "number" ||
        typeof data.underFourHours !== "number" ||
        typeof data.today !== "number" ||
        typeof data.yesterday !== "number" ||
        typeof data.older !== "number"
      ) {
        throw new Error("Invalid response format from Gemini");
      }

      return data;
    } catch (parseError) {
      console.error("Error parsing Gemini response:", text);
      throw new Error(
        `Failed to parse update frequency data: ${parseError.message}`,
      );
    }
  } catch (error) {
    console.error("Error analyzing update frequency with Gemini:", error);
    throw new Error(`Update frequency analysis failed: ${error.message}`);
  }
}

/**
 * Analyzes sentiment of articles in a screenshot
 * @param {string} imagePath - Path to the screenshot file
 * @returns {Promise<Array>} - Array of articles with sentiment data for treemap visualization
 */
async function analyzeSentiment(imagePath) {
  try {
    // Get the Gemini 2.5 Flash model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Prepare the image for Gemini
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: "image/webp",
      },
    };

    // Create the prompt
    const prompt = `You are analyzing a screenshot of a news website homepage to determine the sentiment of visible articles.

TASK:
Analyze all visible article headlines and summaries on this page. For each article, determine:
1. The headline (translated to English if needed)
2. The sentiment: Positive, Negative, Neutral, or Mixed
3. A sentiment score (1-10, where 1 is very negative, 10 is very positive, 5-6 is neutral)

IMPORTANT:
- Analyze ALL visible articles (aim for at least 10-15 articles)
- Translate headlines to English
- Base sentiment on the tone and content of the headline/summary
- Return ONLY a valid JSON array, no other text

Return your answer in this EXACT JSON format:
[
  {
    "headline": "Article headline in English",
    "sentiment": "Positive",
    "score": 8
  },
  {
    "headline": "Another headline",
    "sentiment": "Negative",
    "score": 3
  }
]

Return ONLY the JSON array, nothing else.`;

    // Generate content
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Parse the JSON response
    try {
      // Remove markdown code blocks if present
      const jsonText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const data = JSON.parse(jsonText);

      // Validate the response is an array
      if (!Array.isArray(data)) {
        throw new Error("Response is not an array");
      }

      // Validate each item has required fields
      data.forEach((item, index) => {
        if (
          !item.headline ||
          !item.sentiment ||
          typeof item.score !== "number"
        ) {
          throw new Error(`Invalid item at index ${index}`);
        }
      });

      return data;
    } catch (parseError) {
      console.error("Error parsing Gemini response:", text);
      throw new Error(`Failed to parse sentiment data: ${parseError.message}`);
    }
  } catch (error) {
    console.error("Error analyzing sentiment with Gemini:", error);
    throw new Error(`Sentiment analysis failed: ${error.message}`);
  }
}

/**
 * Analyzes coverage quality by comparing front page content with broader market trends
 * @param {string} imagePath - Path to the screenshot file
 * @returns {Promise<object>} - Coverage analysis with strengths and gaps
 */
async function analyzeCoverageComparison(imagePath) {
  try {
    // Get the Gemini 2.5 Flash model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Prepare the image for Gemini
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: "image/webp",
      },
    };

    // Create the prompt
    const prompt = `You are analyzing a screenshot of a news website homepage to evaluate its coverage quality.

TASK:
1. Identify the main themes and topics covered on this front page (e.g., politics, economy, sports, technology, etc.)
2. Based on the language/region of this news service, consider what other major trending news stories would be relevant in that market
3. Compare what IS covered vs what SHOULD be covered
4. Provide an assessment of coverage strengths and gaps

IMPORTANT:
- Write everything in English
- Be specific about topics and themes
- Consider the target audience's language/region when thinking about trending news
- Return ONLY a valid JSON object

Return your answer in this EXACT JSON format:
{
  "mainThemes": [
    "Politics - National elections",
    "Economy - Inflation concerns",
    "Sports - Football championship"
  ],
  "coverageStrengths": [
    "Strong coverage of local political developments with multiple perspectives",
    "Comprehensive sports reporting with timely updates"
  ],
  "coverageGaps": [
    "Missing international technology news (major AI developments)",
    "Limited environmental/climate coverage despite regional concerns",
    "No coverage of major entertainment industry news"
  ],
  "trendingMissing": [
    "Major tech company announcement trending globally",
    "Regional climate crisis developments",
    "Important cultural event in target market"
  ],
  "overallAssessment": "The front page shows strong focus on political and sports news but appears to undercover technology and environmental topics that are trending in the target market. Consider diversifying coverage to include more international tech stories and regional environmental issues."
}

Return ONLY the JSON object, nothing else.`;

    // Generate content
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Parse the JSON response
    try {
      // Remove markdown code blocks if present
      const jsonText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const data = JSON.parse(jsonText);

      // Validate the response has all required fields
      if (
        !Array.isArray(data.mainThemes) ||
        !Array.isArray(data.coverageStrengths) ||
        !Array.isArray(data.coverageGaps) ||
        !Array.isArray(data.trendingMissing) ||
        !data.overallAssessment
      ) {
        throw new Error("Invalid response format from Gemini");
      }

      return data;
    } catch (parseError) {
      console.error("Error parsing Gemini response:", text);
      throw new Error(
        `Failed to parse coverage analysis data: ${parseError.message}`,
      );
    }
  } catch (error) {
    console.error("Error analyzing coverage with Gemini:", error);
    throw new Error(`Coverage analysis failed: ${error.message}`);
  }
}

/**
 * Rewrites top 5 article headlines for social media optimization
 * @param {string} imagePath - Path to the screenshot file
 * @returns {Promise<Array>} - Array of articles with original and social media optimized titles in both languages
 */
async function rewriteForSocialMedia(imagePath, targetLanguage = "Unknown") {
  try {
    // Get the Gemini 2.5 Flash model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Prepare the image for Gemini
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: "image/webp",
      },
    };

    // Create the prompt
    const prompt = `You are analyzing a screenshot of a ${targetLanguage} news website homepage to rewrite article headlines for social media sharing.

TASK:
1. Identify the top 5 most prominent articles on this page
2. For each article, identify the original headline
3. Rewrite each headline to be optimized for social media (engaging, concise, includes key hook)
4. Provide the social media version in BOTH English AND ${targetLanguage}

IMPORTANT: The target language for this news service is ${targetLanguage}. You MUST provide the translated social media headlines in ${targetLanguage}, NOT in any other language.

SOCIAL MEDIA OPTIMIZATION TIPS:
- Make it attention-grabbing and clickable
- Keep it concise (under 80 characters when possible)
- Use active voice
- Include emotional hooks or curiosity gaps
- Maintain journalistic integrity - don't sensationalize beyond the story

IMPORTANT:
- Identify the target language of the news service
- Return ONLY a valid JSON array
- Provide exactly 5 articles

Return your answer in this EXACT JSON format:
[
  {
    "originalHeadline": "Original headline in ${targetLanguage}",
    "targetLanguage": "${targetLanguage}",
    "socialMediaEnglish": "Engaging social media version in English",
    "socialMediaTarget": "Engaging social media version in ${targetLanguage}"
  },
  {
    "originalHeadline": "Another headline in ${targetLanguage}",
    "targetLanguage": "${targetLanguage}",
    "socialMediaEnglish": "Another engaging version in English",
    "socialMediaTarget": "Another engaging version in ${targetLanguage}"
  }
]

Return ONLY the JSON array, nothing else.`;

    // Generate content
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Parse the JSON response
    try {
      // Remove markdown code blocks if present
      const jsonText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const data = JSON.parse(jsonText);

      // Validate the response is an array
      if (!Array.isArray(data)) {
        throw new Error("Response is not an array");
      }

      // Validate each item has required fields
      data.forEach((item, index) => {
        if (
          !item.originalHeadline ||
          !item.targetLanguage ||
          !item.socialMediaEnglish ||
          !item.socialMediaTarget
        ) {
          throw new Error(`Invalid item at index ${index}`);
        }
      });

      return data;
    } catch (parseError) {
      console.error("Error parsing Gemini response:", text);
      throw new Error(
        `Failed to parse social media rewrite data: ${parseError.message}`,
      );
    }
  } catch (error) {
    console.error("Error rewriting for social media with Gemini:", error);
    throw new Error(`Social media rewrite failed: ${error.message}`);
  }
}

/**
 * Analyzes audience fit for visible front-page content
 * @param {string} imagePath - Path to the screenshot file
 * @returns {Promise<object>} - Audience fit analysis data
 */
async function analyzeAudienceFit(imagePath) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: "image/webp",
      },
    };

    const prompt = `You are analyzing a screenshot of a news website homepage to evaluate audience fit.

TASK:
1. Infer the likely primary audience segment from visible headlines, topics, and writing style.
2. Estimate readability level and content complexity.
3. Score how well the visible content matches the inferred audience.
4. Identify strengths, mismatches, and practical improvements.

IMPORTANT:
- Write everything in English.
- Keep claims grounded in what is visible on the page.
- Return ONLY a valid JSON object.

Return your answer in this EXACT JSON format:
{
  "primaryAudience": "General adults interested in national and international current affairs",
  "readabilityLevel": "Intermediate",
  "complexityLevel": "Moderate",
  "audienceFitScore": 78,
  "fitStrengths": [
    "Clear, concise headline structure supports quick scanning",
    "Topic mix aligns with general-news audience expectations"
  ],
  "fitGaps": [
    "Some headlines use specialist political/economic terms without context",
    "Limited explanatory content for younger or less-informed readers"
  ],
  "recommendations": [
    "Add short explainers for technical stories",
    "Increase service-oriented stories to broaden appeal"
  ],
  "overallAssessment": "The front page is a solid fit for a mainstream adult audience, with room to improve accessibility for broader readership segments."
}

Rules for fields:
- readabilityLevel must be one of: "Beginner", "Intermediate", "Advanced"
- complexityLevel must be one of: "Low", "Moderate", "High"
- audienceFitScore must be an integer from 0 to 100

Return ONLY the JSON object, nothing else.`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    try {
      const jsonText = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const data = JSON.parse(jsonText);

      if (
        !data.primaryAudience ||
        !data.readabilityLevel ||
        !data.complexityLevel ||
        typeof data.audienceFitScore !== "number" ||
        !Array.isArray(data.fitStrengths) ||
        !Array.isArray(data.fitGaps) ||
        !Array.isArray(data.recommendations) ||
        !data.overallAssessment
      ) {
        throw new Error("Invalid response format from Gemini");
      }

      return data;
    } catch (parseError) {
      console.error("Error parsing Gemini response:", text);
      throw new Error(
        `Failed to parse audience fit data: ${parseError.message}`,
      );
    }
  } catch (error) {
    console.error("Error analyzing audience fit with Gemini:", error);
    throw new Error(`Audience fit analysis failed: ${error.message}`);
  }
}
