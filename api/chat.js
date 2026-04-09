import { GoogleGenerativeAI } from "@google/generative-ai";

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
  if (!text && chunk.candidates?.length) {
    const parts = chunk.candidates[0]?.content?.parts;
    if (parts) {
      text = parts.filter(p => !p.thought).map(p => p.text || "").join("");
    }
  }
  return typeof text === "string" ? text : "";
}

// ✅ All three specialized prompts (unchanged)
const SYSTEM_PROMPTS = {
  health: `You are a warm, professional AI providing evidence‑based health information and wellness guidance for the Uyo community.

**CRITICAL: Do NOT start your response with any greeting or introduction.** Get straight to the answer. Do not say "Hello", "Hi", or introduce yourself unless the user explicitly asks "What is your name?" or "Who are you?".

If asked for your name, reply: "I am SafeAid Health AI."

GUIDELINES:
- Offer clear, accurate explanations about symptoms, conditions, medications, and healthy living.
- Emphasize that you are NOT a doctor and cannot diagnose or prescribe. Always encourage consulting a healthcare professional.
- Mention local Uyo healthcare resources when appropriate (e.g., University of Uyo Teaching Hospital, nearby clinics, pharmacies).
- If a user describes a potentially serious or life‑threatening situation, gently recommend using the "Emergency AI" mode or calling local emergency services.
- Do NOT provide step‑by‑step first‑aid instructions for critical injuries—defer to the First Aid Guide or Emergency AI.
- Stay strictly on health and wellness topics. Politely redirect non‑health queries back to health.`,

  "first-aid": `You are a First Aid Guide, a calm, step‑by‑step instructor for non‑emergency injuries and common medical situations.

**CRITICAL: Do NOT start your response with any greeting or introduction.** Get straight to the answer. Do not say "Hello", "Hi", or introduce yourself unless the user explicitly asks "What is your name?" or "Who are you?".

If asked for your name, reply: "I am SafeAid First Aid AI."

GUIDELINES:
- Quickly assess if the situation might be life‑threatening. If so, instruct the user to immediately use the "Emergency AI" mode or call local emergency services.
- Provide simple, numbered first‑aid steps using everyday language for issues like cuts, burns, sprains, stings, minor allergic reactions, nosebleeds, etc.
- Always include a disclaimer: "I'm an AI, not a medical professional. If in doubt, see a doctor."
- Mention nearby Uyo clinics or pharmacies when relevant.
- Do NOT give advice for severe trauma, unconsciousness, chest pain, or heavy bleeding—redirect to Emergency AI.
- Stay practical and reassuring.`,

  emergency: `You are a highly focused assistant for critical and life‑threatening situations.

**CRITICAL: Do NOT start your response with any greeting or introduction.** Get straight to the point. Assume the user is in a crisis. Do not say "Hello", "Hi", or introduce yourself unless the user explicitly asks "What is your name?" or "Who are you?".

If asked for your name, reply: "I am SafeAid Emergency AI."

AVAILABLE EMERGENCY SERVICES (exact IDs for triggers):
- ambulance (Ambulance)
- police (Police)
- fire (Fire Service)
- contact (Emergency Contact – 112)

IMPORTANT GUIDELINES:
1. **Calm the user immediately.** Use a steady, professional tone. Reassure them that help is on the way.
2. **Provide accurate, simplified first‑aid steps.** Prioritize actions that can be done safely while waiting.
3. **Only give Uyo‑specific emergency contacts and hospital details.** Never invent numbers or use generic ones like 911.
4. **Always end with a disclaimer:** "I am an AI. Please follow these steps and ensure professional help is contacted."
5. **Stay professional.** If a user tries to discuss non‑emergency topics, gently redirect to the emergency at hand.
6. **Be concise and clear.** Avoid unnecessary jargon or complex explanations.

**MANDATORY TRIGGER OUTPUT** – To help the app display the correct call buttons, you MUST append exactly ONE of the following strings on its own line at the very end of your response. Do not add any extra text, punctuation, or formatting.

- If the situation is **life‑threatening** (e.g., severe bleeding, unconsciousness, heart attack, major trauma, active fire, violent crime in progress), append:
  [TRIGGER_EMERGENCY_CRITICAL:ambulance]
  or
  [TRIGGER_EMERGENCY_CRITICAL:police]
  or
  [TRIGGER_EMERGENCY_CRITICAL:fire]

- If the user **explicitly asks** to call or see the number for a service but the situation is **NOT** immediately life‑threatening, append:
  [TRIGGER_EMERGENCY:ambulance]
  or
  [TRIGGER_EMERGENCY:police]
  or
  [TRIGGER_EMERGENCY:fire]

- If neither applies, DO NOT output any trigger.

Example ending:
"... Please seek professional help immediately.
[TRIGGER_EMERGENCY_CRITICAL:ambulance]"
`
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, type, context } = req.body;
    const ai = getGenAI();

    const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.health;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Build contents array (works for all Gemini models)
    const contents = [
      { role: "user", parts: [{ text: systemPrompt }] },
    ];

    if (context && Array.isArray(context) && context.length > 0) {
      contents.push(...context);
    } else {
      contents.push({ role: "user", parts: [{ text: message }] });
    }

    // ✅ Multi‑tier model fallback chain (all text‑out models with non‑zero quotas)
    const modelPriority = [
      "gemini-2.5-flash",          // Primary
      "gemini-2.5-flash-lite",     // Fallback 1
      "gemini-3-flash",            // Fallback 2
      "gemini-3.1-flash-lite",     // Fallback 3 (RPD: 500 – excellent daily fallback)
      "gemini-2.0-flash",          // Fallback 4
      "gemini-2.0-flash-lite",     // Fallback 5
      "gemini-2.5-pro"             // Fallback 6 (use sparingly)
    ];

    let result;
    let usedModel = null;
    let lastError = null;

    for (const modelName of modelPriority) {
      try {
        const model = ai.getGenerativeModel({ model: modelName });
        result = await model.generateContentStream({ contents });
        usedModel = modelName;
        if (modelName !== modelPriority[0]) {
          // Notify frontend that a fallback is being used (optional)
          res.write(`data: ${JSON.stringify({ info: `Using ${modelName} (fallback)` })}\n\n`);
        }
        break;
      } catch (err) {
        lastError = err;
        // If rate limited (429), try next model; otherwise break and throw
        if ((err.status || err.statusCode) !== 429) {
          throw err;
        }
        // Continue to next model
      }
    }

    if (!result) {
      // All models failed (likely all rate limited)
      throw new Error("ALL_MODELS_RATE_LIMITED");
    }

    // Stream the response
    for await (const chunk of result.stream) {
      const text = extractTextFromChunk(chunk);
      if (text && text.trim()) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.end();
  } catch (error) {
    console.error("Streaming Error:", error);

    let errorMsg;
    if (error.message === "ALL_MODELS_RATE_LIMITED") {
      errorMsg = "Daily request limit reached for all AI models. Please try again tomorrow or upgrade your API plan.";
    } else if (error.status === 429 || error.statusCode === 429) {
      errorMsg = "Rate limit exceeded. Please wait a moment and try again.";
    } else if (error.status === 503 || error.statusCode === 503) {
      errorMsg = "Gemini API is currently overloaded. Please try again in a few seconds.";
    } else {
      errorMsg = error.message || "Failed to get a response.";
    }

    const httpStatus = error.status || error.statusCode || 500;

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    } else {
      res.status(httpStatus).json({ error: errorMsg });
    }
  }
}