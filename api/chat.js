import { GoogleGenerativeAI } from "@google/generative-ai";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, type } = req.body;
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

    let systemPrompt = `You are SafeAid, a professional, highly accurate AI emergency and health assistant for Uyo community.
    
    CRITICAL INSTRUCTIONS:
    1. CALM THE USER: Always start by reassuring the user in a calm, professional tone.
    2. ACCURACY: Provide precise, medically-sound (but simplified) first-aid steps.
    3. PRECISION : every information you give about emergency contact or hospitals should be Uyo emergency contacts /hospital details ad it should be very accurate (Do not suggest numbers you made up (only Uyo emergency contact or hospital details should be suggested) and do not suggest generic or non Uyo emergency contact details or hospital names e.g. 911) 
    4. EMERGENCY TRIGGER: If the user describes a life-threatening situation, append [TRIGGER_EMERGENCY:ambulance/police/fire].
    5. DISCLAIMER: Always remind them you are an AI and they should seek professional help.
    6. PROFESSIONALISM : Never accommodate NON-HEALTH related talks and non professional talks, let everything you say be professional and if user tries to do otherwise maintain professionalism and go back to health 
    
    Current Mode: ${type === "emergency" ? "CRITICAL EMERGENCY" : "Health Inquiry"}`;

    // Set headers for streaming (Server-Sent Events)
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n${message}` }] }],
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
        error: "SafeAid AI is currently busy (Rate Limit Reached). Please wait and try again."
      });
    }
    res.status(500).json({ error: error.message || "Failed to stream AI response" });
  }
}
