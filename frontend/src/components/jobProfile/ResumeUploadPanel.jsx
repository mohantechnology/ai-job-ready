import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { prefillProfileFromResume } from "../../lib/api.js";
import { extractTextFromPdf } from "../../lib/resumeParser.js";

const MAX_RESUME_CHARS = 18000;

export default function ResumeUploadPanel({ onCancel, onFilled }) {
  const [parsing, setParsing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.type && file.type !== "application/pdf") {
      setError("Upload a PDF resume.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("That PDF is larger than 8 MB.");
      return;
    }

    setError("");
    setParsing(true);
    try {
      const text = await extractTextFromPdf(file);
      if (!text || text.length < 40) {
        setError("Couldn't find readable text in that PDF. Try a different file.");
        return;
      }
      setParsing(false);
      setExtracting(true);
      const result = await prefillProfileFromResume(text.slice(0, MAX_RESUME_CHARS));
      if (!result?.filledCount) {
        setError("No profile details were found in that resume. Try a different file.");
        return;
      }
      onFilled(result.values || {});
    } catch (err) {
      setError(err.message || "Failed to read that PDF.");
    } finally {
      setParsing(false);
      setExtracting(false);
    }
  }

  const busy = parsing || extracting;
  const status = extracting ? "Filling your profile..." : parsing ? "Reading PDF..." : "Upload resume (PDF)";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg shadow-black/20">
      <h2 className="text-lg font-semibold text-white">Fill from your resume</h2>
      <p className="mt-1 text-sm text-slate-400">
        Upload a PDF. We will read it and open the form with your details filled in, so you can check them before saving.
      </p>

      <label className={`mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-10 text-center transition ${busy ? "cursor-wait" : "cursor-pointer hover:border-indigo-400/50"}`}>
        {busy ? <Loader2 className="h-6 w-6 animate-spin text-indigo-300" /> : <Upload className="h-6 w-6 text-indigo-300" />}
        <span className="mt-3 text-sm font-medium text-slate-100">{status}</span>
        <span className="mt-1 text-xs text-slate-500">
          {busy ? "This can take a moment." : "Text is extracted in your browser. The file itself is not uploaded."}
        </span>
        <input type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={busy} className="hidden" />
      </label>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200 disabled:opacity-40"
        >
          Back
        </button>
      </div>
    </div>
  );
}
