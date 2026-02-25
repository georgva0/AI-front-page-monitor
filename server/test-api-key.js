require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testApiKey() {
  console.log("Testing Gemini API Key...");
  console.log("API Key loaded:", process.env.GEMINI_API_KEY ? "✓ Yes" : "✗ No");

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not found in .env file");
    process.exit(1);
  }

  if (process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
    console.error(
      "❌ Please replace 'your_gemini_api_key_here' with your actual API key",
    );
    process.exit(1);
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    console.log("Sending test request to Gemini...");
    const result = await model.generateContent(
      "Hello! Please respond with 'API key is working!'",
    );
    const response = await result.response;
    const text = response.text();

    console.log("✅ API Key is VALID!");
    console.log("Response from Gemini:", text);
    process.exit(0);
  } catch (error) {
    console.error("❌ API Key test FAILED!");
    console.error("Error:", error.message);
    if (error.message.includes("API_KEY_INVALID")) {
      console.error(
        "The API key is invalid. Please check your key at: https://aistudio.google.com/app/apikey",
      );
    }
    process.exit(1);
  }
}

testApiKey();
