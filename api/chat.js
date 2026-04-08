import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes("YOUR_API_KEY") || apiKey.includes("MY_GEMINI_API_KEY")) {
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, type } = req.body;
    const ai = getGenAI();

    // ✅ SYSTEM PROMPT
    const systemPrompt = `You are SafeAid, a professional, highly accurate AI emergency and health assistant for Uyo community.
    
CRITICAL INSTRUCTIONS:
1. CALM THE USER: Always start by reassuring the user in a calm, professional tone.
2. ACCURACY: Provide precise, medically-sound (but simplified) first-aid steps.
3. PRECISION: every information you give about emergency contact or hospitals should be Uyo emergency contacts /hospital details and it should be very accurate (Do not suggest numbers you made up and do not suggest generic or non-Uyo emergency contact details or hospital names e.g. 911).
4. EMERGENCY TRIGGER: If the user describes a life-threatening situation, append [TRIGGER_EMERGENCY:ambulance/police/fire].
5. DISCLAIMER: Always remind them you are an AI and they should seek professional help.
6. PROFESSIONALISM: Never accommodate non-health related talks; let everything you say be professional. If user tries otherwise, maintain professionalism and return to health.

Current Mode: ${type === "emergency" ? "CRITICAL EMERGENCY" : "Health Inquiry"}`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // ✅ MODEL SELECTION
    let modelName = "gemini-2.5-flash";       // primary
    let fallbackName = "gemini-2.5-flash-lite"; // fallback

    let model = ai.getGenerativeModel({ model: modelName });
    let result;

    try {
      // Detect role type depending on model
      const roleSystem = modelName === fallbackName ? "MODEL" : "system";
      const roleUser = modelName === fallbackName ? "USER" : "user";

      result = await model.generateContentStream({
        contents: [
          { role: roleSystem, parts: [{ text: systemPrompt }] },
          { role: roleUser, parts: [{ text: message }] },
        ],
      });
    } catch (err) {
      // Fallback only on 429 (rate limit)
      if ((err.status || err.statusCode) === 429) {
        model = ai.getGenerativeModel({ model: fallbackName });

        const roleSystem = "MODEL";
        const roleUser = "USER";

        // Optional: send temporary notification to front-end
        res.write(`data: ${JSON.stringify({ info: "Fallback: using 2.5 Flash Lite model" })}\n\n`);

        result = await model.generateContentStream({
          contents: [
            { role: roleSystem, parts: [{ text: systemPrompt }] },
            { role: roleUser, parts: [{ text: message }] },
          ],
        });
      } else {
        throw err;
      }
    }

    // Stream AI chunks
    for await (const chunk of result.stream) {
      const text = extractTextFromChunk(chunk);
      if (text && text.trim()) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.end();
  } catch (error) {
    console.error(
      "Streaming Error [status=%s] [message=%s]",
      error.status || error.statusCode || "?",
      error.message || "no message"
    );

    const httpStatus = error.status || error.httpStatus || error.statusCode || 500;
    const apiMessage = error.message || "";

    function buildErrorMessage(status, message) {
      if (status === 429) {
        return message
          ? `Rate limited by Gemini API: ${message}`
          : "Too many requests. Please wait a moment and try again.";
      }
      if (status === 503) {
        return "Gemini API is currently experiencing high demand. Please try again in a few seconds.";
      }
      if (status === 404) {
        return "The AI model could not be found. Please check the model name in your configuration.";
      }
      return message || "Failed to get a response from the AI. Please try again.";
    }

    const errorMsg = buildErrorMessage(httpStatus, apiMessage);

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
      return;
    }

    res.status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500).json({ error: errorMsg });
  }
  }
