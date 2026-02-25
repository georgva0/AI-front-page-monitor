require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
  console.log("Listing available Gemini models...");

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not found in .env file");
    process.exit(1);
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Try to list models
    console.log("Fetching model list from API...\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log("Available models that support generateContent:");
    console.log("=".repeat(60));

    if (data.models) {
      data.models
        .filter((model) =>
          model.supportedGenerationMethods?.includes("generateContent"),
        )
        .forEach((model) => {
          console.log(`✓ ${model.name}`);
          console.log(`  Display Name: ${model.displayName}`);
          console.log(`  Description: ${model.description}`);
          console.log("");
        });
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

listModels();
