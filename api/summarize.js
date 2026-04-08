import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (
      !apiKey ||
      apiKey.includes("YOUR_API_KEY") ||
      apiKey.includes("MY_GEMINI_API_KEY")
    ) {
      throw new Error(
        "GEMINI_API_KEY is missing or invalid. Please add it in your environment settings."
      );
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

function extractTextFromChunk(chunk) {
  let text = "";

  try {
    if (typeof chunk.text === "function") {
      text = chunk.text() || "";
    } else if (typeof chunk.text === "string") {
      text = chunk.text;
    }
  } catch (_) {}

  if (!text && chunk.candidates && chunk.candidates.length > 0) {
    const candidate = chunk.candidates[0];
    if (candidate.content && candidate.content.parts) {
      text = candidate.content.parts
        .filter((p) => !p.thought)
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("");
    }
  }

  return typeof text === "string" ? text : "";
}

const upload = multer({ storage: multer.memoryStorage() });

const runMiddleware = (req, res, fn) =>
  new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("image"));

    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

    let parts = [];
    if (req.file) {
      const imagePart = {
        inlineData: {
          data: req.file.buffer.toString("base64"),
          mimeType: req.file.mimetype,
        },
      };
      parts.push(imagePart);

      parts.unshift({
        text: `Analyze this image as SafeAid Medical Assistant.
1. Detect if it is a medical document (report, prescription, lab result, etc.).
2. If YES, summarize it simply for a layperson. Focus on key findings and recommendations.
3. Be reassuring and calm and structure your report in a clean, clear, professional and understandable way.
4. Avoid complex medical terms; if unavoidable, include the nearest meaning in brackets.
5. If NO, return exactly: "This does not appear to be a medical report."`,
      });
    } else {
      const { message, type } = req.body;
      parts.push({
        text: `You are SafeAid, a professional, highly accurate AI emergency and health assistant for Uyo community.

CRITICAL INSTRUCTIONS:
1. CALM THE USER: Always start by reassuring the user in a calm, professional tone.
2. ACCURACY: Provide precise, medically-sound (but simplified) first-aid steps.
3. PRECISION: every information you give about emergency contact or hospitals should be Uyo emergency contacts /hospital details and it should be very accurate (Do not suggest numbers you made up and do not suggest generic or non-Uyo emergency contact details or hospital names e.g. 911).
4. EMERGENCY TRIGGER: If the user describes a life-threatening situation, append [TRIGGER_EMERGENCY:ambulance/police/fire].
5. DISCLAIMER: Always remind them you are an AI and they should seek professional help.
6. PROFESSIONALISM: Never accommodate non-health related talks; let everything you say be professional. If user tries otherwise, maintain professionalism and return to health.

Current Mode: ${type === "emergency" ? "CRITICAL EMERGENCY" : "Health Inquiry"}

User message: ${message}`,
      });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const result = await model.generateContentStream({
      contents: [{ role: "user", parts }],
    });

    for await (const chunk of result.stream) {
      const text = extractTextFromChunk(chunk);
      if (text && text.trim()) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.end();
  } catch (error) {
    console.error("Streaming Error:", error);

    if (res.headersSent) {
      const errorMsg =
        error.status === 429
          ? "Quota exceeded for Gemini free tier. Please wait until your quota resets or upgrade your plan."
          : error.status === 503
          ? "Gemini API is currently experiencing high demand. Please try again later."
          : error.message || "Failed to stream AI response";

      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
      return;
    }

    if (error.status === 429) {
      res.status(429).json({
        error: "Quota exceeded for Gemini free tier. Please wait until your quota resets or upgrade your plan.",
      });
    } else if (error.status === 503) {
      res.status(503).json({
        error: "Gemini API is currently experiencing high demand. Please try again later.",
      });
    } else {
      res.status(500).json({
        error: error.message || "Failed to stream AI response",
      });
    }
  }
}
