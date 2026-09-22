import { useEffect } from "react";
import { FileText, PencilLine, X } from "lucide-react";

export default function CompleteProfileModal({ onClose, onFillManually, onFillFromResume }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-profile-title"
        className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/40"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 id="complete-profile-title" className="pr-8 text-lg font-semibold text-white">
          How do you want to start?
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Pick the easiest path. You can always edit everything later.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onFillFromResume}
            className="flex flex-col items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left transition hover:border-indigo-400/40 hover:bg-slate-950"
          >
            <FileText className="h-5 w-5 text-indigo-300" />
            <span className="text-sm font-semibold text-white">Fill using resume</span>
            <span className="text-xs text-slate-500">Upload a PDF and we will prefill the form for you to check.</span>
          </button>

          <button
            type="button"
            onClick={onFillManually}
            className="flex flex-col items-start gap-2 rounded-xl border border-indigo-400/40 bg-indigo-500/10 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-500/15"
          >
            <PencilLine className="h-5 w-5 text-indigo-300" />
            <span className="text-sm font-semibold text-white">Fill manually</span>
            <span className="text-xs text-slate-500">A short, guided form with only the basics first.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
