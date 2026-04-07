import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes("YOUR_API_KEY") || apiKey.includes("MY_GEMINI_API_KEY")) {
      throw new Error("GEMINI_API_KEY is missing or invalid. Please go to 'Settings' > 'Secrets' in AI Studio and add your GEMINI_API_KEY.");
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
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

    let systemPrompt = `You are SafeAid, a professional, highly accurate AI emergency and health assistant. 
    
    CRITICAL INSTRUCTIONS:
    1. CALM THE USER: Always start by reassuring the user in a calm, professional tone. Use phrases like "I'm here to help you," "Stay calm, we are taking action," or "Take a deep breath, you're not alone."
    2. ACCURACY: Provide precise, medically-sound (but simplified) first-aid steps.
    3. EMERGENCY TRIGGER: If the user describes a life-threatening situation or a crime/fire in progress, you MUST include one of the following tags at the VERY END of your response based on the need:
       - For medical emergencies: [TRIGGER_EMERGENCY:ambulance]
       - For crimes or security threats: [TRIGGER_EMERGENCY:police]
       - For fires or rescue: [TRIGGER_EMERGENCY:fire]
    4. DISCLAIMER: Always remind them you are an AI and they should seek professional help.
    
    Current Mode: ${type === "emergency" ? "CRITICAL EMERGENCY" : "Health Inquiry"}`;

    const result = await model.generateContent([systemPrompt, message]);
    const response = await result.response;
    const text = response.text();

    res.json({ text });
  } catch (error) {
    console.error("Chat Error:", error);
    if (error.message?.includes("429") || error.message?.includes("quota")) {
      return res.status(429).json({ 
        error: "SafeAid AI is currently busy (Rate Limit Reached). Please wait a few seconds and try again." 
      });
    }
    res.status(500).json({ error: error.message || "Failed to get AI response" });
  }
}
