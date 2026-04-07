import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes("YOUR_API_KEY") || apiKey.includes("MY_GEMINI_API_KEY")) {
      throw new Error("GEMINI_API_KEY is missing or invalid. Please add it in your environment settings.");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

const upload = multer({ storage: multer.memoryStorage() });

// Helper to run middleware in serverless
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("image"));

    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype,
      },
    };

    const prompt = `Analyze this image as SafeAid Medical Assistant.
    1. Detect if it is a medical document (report, prescription, lab result, etc.).
    2. If YES, summarize it simply for a layperson. Focus on key findings and recommendations.
    3. Be reassuring and calm.
    4. If NO, return exactly: "This does not appear to be a medical report."`;

    // Set headers for streaming (Server-Sent Events)
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.end();
  } catch (error) {
    console.error("Streaming Error:", error);
    if (error.message?.includes("429") || error.message?.includes("quota")) {
      return res.status(429).json({
        error: "Analysis limit reached. Please wait and try again."
      });
    }
    res.status(500).json({ error: error.message || "Failed to analyze image" });
  }
}
