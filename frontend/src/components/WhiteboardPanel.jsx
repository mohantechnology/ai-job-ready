import { useCallback, useRef, useState } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { Check, Clock, History, Maximize2, Minimize2, PenSquare, Send, X } from "lucide-react";
import { compressImageToJpegDataUrl } from "../lib/imageCompression.js";

function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatSize(bytes) {
  if (!bytes) return "";
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// Defaults to the same inline size/slot as TextEditorPanel next to the
// transcript; `expanded` switches it to a full-screen overlay (with a bit of
// margin) for when the drawing canvas needs more room.
export default function WhiteboardPanel({
  open,
  expanded = false,
  onToggleExpand,
  onClose,
  onSubmit,
  disabled,
  history = [],
}) {
  const excalidrawApiRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = useCallback(async () => {
    const api = excalidrawApiRef.current;
    if (!api || disabled || submitting) return;

    const elements = api.getSceneElements();
    if (!elements.length) {
      setErrorMsg("Draw something before sending.");
      return;
    }

    setErrorMsg("");
    setSubmitting(true);
    try {
      const blob = await exportToBlob({
        elements,
        appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff" },
        files: api.getFiles(),
        mimeType: "image/png",
      });
      const { dataUrl, sizeBytes } = await compressImageToJpegDataUrl(blob);
      const ok = await onSubmit(dataUrl, sizeBytes);
      if (ok) {
        api.updateScene({ elements: [] });
        setJustSent(true);
        setTimeout(() => setJustSent(false), 1500);
      } else {
        setErrorMsg("Couldn't send - the interview session isn't active right now.");
      }
    } catch (err) {
      console.error("Failed to export/submit whiteboard drawing:", err);
      setErrorMsg("Something went wrong preparing the image. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [disabled, submitting, onSubmit]);

  if (!open) return null;

  const outerClass = expanded
    ? "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
    : "relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden";
  const innerClass = expanded
    ? "relative flex h-full max-h-[92vh] w-full max-w-6xl min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/50"
    : "relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-lg shadow-black/20";

  return (
    <div className={outerClass}>
      <div className={innerClass}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <PenSquare size={16} className="text-indigo-300" strokeWidth={2} />
            <div>
              <h2 className="text-sm font-semibold text-white">Whiteboard answer</h2>
              <p className="text-xs text-slate-400">Sketch a diagram, schema, or system design, then send it to the interviewer.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
                historyOpen
                  ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300"
                  : "border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white"
              }`}
              aria-label="Toggle submission history"
              aria-pressed={historyOpen}
            >
              <History size={13} strokeWidth={2} />
              History
              {history.length > 0 && (
                <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] leading-none text-slate-300">
                  {history.length}
                </span>
              )}
            </button>
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                aria-label={expanded ? "Minimize whiteboard" : "Expand whiteboard"}
                title={expanded ? "Minimize" : "Expand"}
              >
                {expanded ? <Minimize2 size={15} strokeWidth={2} /> : <Maximize2 size={15} strokeWidth={2} />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              aria-label="Close whiteboard"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Excalidraw ships its own light theme chrome; a plain white canvas
            keeps drawings legible and matches what gets sent/stored. */}
        <div className="relative min-h-0 flex-1 bg-white">
          <Excalidraw
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
            }}
            initialData={{ appState: { viewBackgroundColor: "#ffffff" } }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
          <span className="flex items-center gap-1 text-xs text-slate-500">
            {justSent ? (
              <>
                <Check size={12} strokeWidth={2.5} className="text-emerald-400" />
                Sent to interviewer
              </>
            ) : errorMsg ? (
              <span className="text-red-300">{errorMsg}</span>
            ) : (
              "Draw, then send when ready"
            )}
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || submitting}
            className="flex items-center gap-1.5 rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={13} strokeWidth={2} />
            {submitting ? "Sending..." : "Send to interviewer"}
          </button>
        </div>

        {historyOpen && (
          <div
            className="absolute inset-0 z-10 bg-slate-950/60"
            onClick={() => setHistoryOpen(false)}
            aria-hidden="true"
          />
        )}

        <div
          className={`absolute inset-y-0 right-0 z-20 flex w-80 max-w-[90%] min-h-0 flex-col border-l border-slate-800 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 transition-transform duration-300 ease-in-out ${
            historyOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History size={16} className="text-indigo-300" strokeWidth={2} />
              <h2 className="text-sm font-semibold text-white">Session history</h2>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              aria-label="Close history"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {history.length === 0 ? (
              <p className="mt-6 text-center text-xs text-slate-500">
                Nothing submitted yet this session.
              </p>
            ) : (
              [...history].reverse().map((entry) => (
                <div key={entry.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
                  <img src={entry.dataUrl} alt="Submitted whiteboard drawing" className="w-full bg-white object-contain" />
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock size={10} strokeWidth={2} />
                      {formatTime(entry.timestamp)}
                    </span>
                    <span className="text-[10px] text-slate-500">{formatSize(entry.sizeBytes)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
