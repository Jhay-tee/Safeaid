export function extractText(parsed) {
  if (!parsed || typeof parsed !== "object") return "";

  if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text;

  if (Array.isArray(parsed.candidates) && parsed.candidates.length > 0) {
    const parts = parsed.candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const joined = parts
        .filter((p) => !p.thought)
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("");
      if (joined.trim()) return joined;
    }
  }

  return "";
}