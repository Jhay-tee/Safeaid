import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
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
  if (!text && chunk.candidates?.length) {
    const parts = chunk.candidates[0]?.content?.parts || [];
    text = parts.map((p) => p.text || "").join("");
  }
  return text || "";
}

function buildErrorMessage(status, message) {
  if (status === 429) return "Too many requests. Please try again.";
  if (status === 503) return "Gemini API busy. Try again later.";
  if (status === 404) return "Model not found.";
  return message || "Failed to get response.";
}

const upload = multer({ storage: multer.memoryStorage() });

const runMiddleware = (req, res, fn) =>
  new Promise((resolve, reject) => {
    fn(req, res, (result) =>
      result instanceof Error ? reject(result) : resolve(result)
    );
  });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("image"));

    const ai = getGenAI();

    const systemPrompt = `You are SafeAid Summarizer.
Summarize medical documents clearly and simply for a layperson.
Avoid complex medical terms; explain briefly if needed.
Be calm, professional, and concise.`;

    // Build parts array (works for all Gemini models)
    const parts = [{ text: systemPrompt }];

    if (req.file) {
      parts.push({
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString("base64"),
        },
      });
    } else if (req.body.textToSummarize) {
      parts.push({
        text: req.body.textToSummarize,
      });
    } else {
      throw new Error("No input provided.");
    }

    const contents = [{ role: "user", parts }];

    // SSE setup
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // ✅ Multi‑tier model fallback chain (same as chat)
    const modelPriority = [
      "gemini-2.5-flash",          // Primary
      "gemini-2.5-flash-lite",     // Fallback 1
      "gemini-3-flash",            // Fallback 2
      "gemini-3.1-flash-lite",     // Fallback 3 (RPD: 500)
      "gemini-2.0-flash",          // Fallback 4
      "gemini-2.0-flash-lite",     // Fallback 5
      "gemini-2.5-pro"             // Fallback 6
    ];

    let result;
    let usedModel = null;

    for (const modelName of modelPriority) {
      try {
        const model = ai.getGenerativeModel({ model: modelName });
        result = await model.generateContentStream({ contents });
        usedModel = modelName;
        if (modelName !== modelPriority[0]) {
          res.write(`data: ${JSON.stringify({ info: `Using ${modelName} (fallback)` })}\n\n`);
        }
        break;
      } catch (err) {
        const status = err.status || err.statusCode;
        if (status !== 429) {
          // Non‑rate‑limit error – throw immediately
          throw err;
        }
        // Rate limited – try next model
      }
    }

    if (!result) {
      throw new Error("ALL_MODELS_RATE_LIMITED");
    }

    // Stream the response
    for await (const chunk of result.stream) {
      const text = extractTextFromChunk(chunk);
      if (text.trim()) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.end();
  } catch (error) {
    console.error("Summarizer Error:", error);

    let errorMsg;
    if (error.message === "ALL_MODELS_RATE_LIMITED") {
      errorMsg = "Daily request limit reached for all AI models. Please try again tomorrow or upgrade your API plan.";
    } else {
      const status = error.status || error.statusCode || 500;
      errorMsg = buildErrorMessage(status, error.message);
    }

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
      return;
    }

    res.status(error.status || 500).json({ error: errorMsg });
  }
}