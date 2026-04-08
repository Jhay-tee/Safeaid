import { useState, useRef } from "react";
import { motion } from "motion/react";
import { FileText, Upload, X, Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import Markdown from "react-markdown";

function extractText(parsed) {
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

export default function MedicalSummarizer({ incrementUsage, isLimitReached }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith("image/")) {
        setError("Please upload an image file (JPG, PNG, etc.).");
        return;
      }
      setFile(selectedFile);
      setError(null);
      setSummary(null);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (isLimitReached) {
      setError("You've reached your limit. Please sign in to continue.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSummary(null);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try {
          const errData = await res.json();
          errMsg = typeof errData.error === "string" ? errData.error : errMsg;
        } catch (_) {}
        setError(errMsg);
        setIsLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let collectedText = "";
      let receivedContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith("data:")) continue;

          const jsonStr = trimmed.replace(/^data:\s*/, "").trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (_) {
            continue;
          }

          if (parsed && typeof parsed.error === "string") {
            setError(parsed.error);
            setIsLoading(false);
            return;
          }

          const text = extractText(parsed);
          if (!text) continue;

          receivedContent = true;
          collectedText = collectedText + text;
          setSummary(collectedText);
        }
      }

      if (!receivedContent) {
        setError("No summary was returned. Please try again or use a clearer image.");
        setIsLoading(false);
        return;
      }

      incrementUsage();
    } catch (err) {
      console.error("Summarize Error:", err);
      setError(err.message || "Request failed. Please check your internet connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setSummary(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-4 rounded-2xl bg-white/5 text-blue-500">
          <FileText className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Medical Record Summarizer</h2>
      </div>

      {!file ? (
        <div
          onClick={() => fileInputRef.current.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile && droppedFile.type.startsWith("image/")) {
              setFile(droppedFile);
              const reader = new FileReader();
              reader.onloadend = () => setPreview(reader.result);
              reader.readAsDataURL(droppedFile);
            } else {
              setError("Please drop an image file.");
            }
          }}
          className="group relative flex flex-col items-center justify-center w-full py-16 bg-white/5 border-2 border-dashed border-white/10 backdrop-blur-md rounded-3xl hover:border-white/20 transition-all cursor-pointer"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <div className="p-6 rounded-full bg-white/5 group-hover:scale-110 transition-transform">
            <Upload className="w-10 h-10 text-white/40 group-hover:text-white" />
          </div>
          <div className="mt-6 text-center">
            <p className="text-lg font-bold">Upload Medical Document</p>
            <p className="text-sm text-white/40">Drag and drop or click to browse</p>
            <p className="text-xs text-white/20 mt-1">Supports JPG, PNG, WebP, and other image formats</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="relative group rounded-3xl overflow-hidden border border-white/10 bg-white/5">
            <img src={preview} alt="Preview" className="w-full h-auto max-h-[400px] object-contain mx-auto" />
            <button
              onClick={clearFile}
              className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full hover:bg-black/80 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={handleUpload}
            disabled={isLoading}
            className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                ANALYZING...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                SUMMARIZE REPORT
              </>
            )}
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-3 text-white/40 text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin" />
          AI is analyzing your document...
        </div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl space-y-4"
        >
          <div className="flex items-start gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="font-medium text-sm leading-relaxed">{error}</p>
          </div>
          {file && (
            <button
              onClick={() => {
                setError(null);
                handleUpload();
              }}
              className="flex items-center gap-2 text-sm font-bold text-red-400 hover:text-red-300 uppercase tracking-wider"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Analysis
            </button>
          )}
        </motion.div>
      )}

      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 bg-white/5 border border-white/10 rounded-3xl prose prose-invert max-w-none shadow-2xl"
        >
          <Markdown>{summary}</Markdown>
        </motion.div>
      )}
    </div>
  );
}
