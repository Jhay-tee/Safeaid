import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes("YOUR_API_KEY") || apiKey.includes("MY_GEMINI_API_KEY")) {
      throw new Error("GEMINI_API_KEY is missing or invalid.");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

function extractTextFromChunk(chunk) {
  let text = "";
  try {
    if (typeof chunk.text === "function") text = chunk.text() || "";
    else if (typeof chunk.text === "string") text = chunk.text;
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

function buildErrorMessage(status, message) {
  if (status === 429) return message ? `Rate limited: ${message}` : "Too many requests.";
  if (status === 503) return "Gemini API busy. Try again later.";
  if (status === 404) return "AI model not found. Check model name.";
  return message || "Failed to get a response from the AI.";
}

const upload = multer({ storage: multer.memoryStorage() });
const runMiddleware = (req, res, fn) =>
  new Promise((resolve, reject) => {
    fn(req, res, (result) => (result instanceof Error ? reject(result) : resolve(result)));
  });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await runMiddleware(req, res, upload.single("image")); // keep your file logic

    const ai = getGenAI();
    const primaryModel = "gemini-2.5-flash";
    const fallbackModel = "gemini-2.5-flash-lite"; // fallback for rate limit

    const { textToSummarize } = req.body; // assuming you have this from client

    // ✅ System prompt separated from user prompt
    const systemPrompt = `You are SafeAid Summarizer. 
Summarize medical documents clearly and simply for a layperson. 
Avoid complex medical terms; provide nearest explanation in brackets if unavoidable. 
Be calm, professional, and concise.`;

    // SSE setup
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });

    let model = ai.getGenerativeModel({ model: primaryModel });
    let result;

    try {
      result = await model.generateContentStream({
        contents: [
          { role: "MODEL", parts: [{ text: systemPrompt }] },
          { role: "USER", parts: [{ text: textToSummarize }] },
        ],
      });
    } catch (err) {
      if ((err.status || err.statusCode) === 429) {
        // fallback model
        model = ai.getGenerativeModel({ model: fallbackModel });
        res.write(`data: ${JSON.stringify({ info: "Now using 2.5 Flash Lite as fallback" })}\n\n`);
        result = await model.generateContentStream({
          contents: [
            { role: "MODEL", parts: [{ text: systemPrompt }] },
            { role: "USER", parts: [{ text: textToSummarize }] },
          ],
        });
      } else {
        throw err;
      }
    }

    for await (const chunk of result.stream) {
      const text = extractTextFromChunk(chunk);
      if (text && text.trim()) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error("Streaming Error:", error.status || error.statusCode || "?", error.message || "no message");
    const httpStatus = error.status || error.httpStatus || error.statusCode || 500;
    const apiMessage = error.message || "";
    const errorMsg = buildErrorMessage(httpStatus, apiMessage);

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
      return;
    }
    res.status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500).json({ error: errorMsg });
  }
      }
