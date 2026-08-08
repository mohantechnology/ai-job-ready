import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";
import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { sql } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { go } from "@codemirror/legacy-modes/mode/go";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { Check, Clock, Code2, Eraser, History, Maximize2, Minimize2, Send, X } from "lucide-react";

// Custom theme instead of the stock oneDark theme so the editor's
// background/accent colors match the rest of the app's slate + indigo
// palette rather than oneDark's near-black default.
const editorTheme = createTheme({
  theme: "dark",
  settings: {
    background: "transparent",
    foreground: "#e2e8f0", // slate-200
    caret: "#a5b4fc", // indigo-300
    selection: "rgba(99, 102, 241, 0.25)", // indigo-500/25
    selectionMatch: "rgba(99, 102, 241, 0.18)",
    lineHighlight: "rgba(148, 163, 184, 0.06)", // slate-400/6
    gutterBackground: "transparent",
    gutterForeground: "#64748b", // slate-500
    gutterBorder: "transparent",
    fontFamily: '"Fira Code", "Consolas", monospace',
  },
  styles: [
    { tag: t.comment, color: "#64748b", fontStyle: "italic" }, // slate-500
    { tag: t.string, color: "#6ee7b7" }, // emerald-300
    { tag: [t.number, t.bool, t.atom], color: "#fcd34d" }, // amber-300
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: "#a5b4fc" }, // indigo-300
    { tag: [t.definition(t.variableName), t.function(t.variableName)], color: "#93c5fd" }, // blue-300
    { tag: t.variableName, color: "#e2e8f0" },
    { tag: [t.typeName, t.className], color: "#7dd3fc" }, // sky-300
    { tag: t.propertyName, color: "#c4b5fd" }, // violet-300
    { tag: t.operator, color: "#cbd5e1" }, // slate-300
    { tag: [t.bracket, t.punctuation], color: "#94a3b8" }, // slate-400
    { tag: t.tagName, color: "#a5b4fc" },
    { tag: t.attributeName, color: "#7dd3fc" },
    { tag: t.invalid, color: "#fca5a5" }, // red-300
  ],
});

// CodeMirror's basicSetup (on by default) already provides auto-closing
// brackets/quotes, language-aware auto-indent, bracket matching and
// undo/redo - no custom key-handling logic needed here.
const LANGUAGES = [
  { id: "plain", label: "Plain text", extension: null },
  { id: "javascript", label: "JavaScript", extension: javascript() },
  { id: "typescript", label: "TypeScript", extension: javascript({ typescript: true }) },
  { id: "jsx", label: "JSX", extension: javascript({ jsx: true }) },
  { id: "tsx", label: "TSX", extension: javascript({ jsx: true, typescript: true }) },
  { id: "python", label: "Python", extension: python() },
  { id: "java", label: "Java", extension: java() },
  { id: "c", label: "C", extension: cpp() },
  { id: "cpp", label: "C++", extension: cpp() },
  { id: "csharp", label: "C#", extension: StreamLanguage.define(csharp) },
  { id: "go", label: "Go", extension: StreamLanguage.define(go) },
  { id: "sql", label: "SQL", extension: sql() },
  { id: "bash", label: "Bash / Shell", extension: StreamLanguage.define(shell) },
  { id: "json", label: "JSON", extension: json() },
  { id: "html", label: "HTML", extension: html() },
  { id: "css", label: "CSS", extension: css() },
];

function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function TextEditorPanel({
  open,
  expanded = false,
  onToggleExpand,
  onClose,
  onSubmit,
  disabled,
  history = [],
}) {
  const [value, setValue] = useState("");
  const [languageId, setLanguageId] = useState("plain");
  const [justSent, setJustSent] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!open) return null;

  const language = LANGUAGES.find((l) => l.id === languageId) || LANGUAGES[0];
  const extensions = useMemo(() => (language.extension ? [language.extension] : []), [language]);

  const handleSubmit = () => {
    const ok = onSubmit(value, language.id === "plain" ? null : language);
    if (ok) {
      setValue("");
      setJustSent(true);
      setTimeout(() => setJustSent(false), 1500);
    }
  };

  const handleClear = () => setValue("");

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleHistorySelect = (entry) => {
    const matched = LANGUAGES.find((l) => l.label === entry.language);
    setLanguageId(matched ? matched.id : "plain");
    setValue(entry.text);
    setHistoryOpen(false);
  };

  const outerClass = expanded
    ? "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
    : "relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden";
  const innerClass = expanded
    ? "relative flex h-full max-h-[92vh] w-full max-w-5xl min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-2xl shadow-black/50"
    : "relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-4";

  return (
    <div className={outerClass}>
      <div className={innerClass}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Code2 size={16} className="text-indigo-300" strokeWidth={2} />
            <div>
              <h2 className="text-sm font-semibold text-white">Text / code answer</h2>
              <p className="text-xs text-slate-400">Write here, then send it to the interviewer.</p>
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
                aria-label={expanded ? "Minimize editor" : "Expand editor"}
                title={expanded ? "Minimize" : "Expand"}
              >
                {expanded ? <Minimize2 size={15} strokeWidth={2} /> : <Maximize2 size={15} strokeWidth={2} />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              aria-label="Close editor"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <label htmlFor="editor-language" className="text-xs font-medium text-slate-400">
            Language
          </label>
          <select
            id="editor-language"
            value={languageId}
            onChange={(e) => setLanguageId(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500/60"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div
          className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 focus-within:border-indigo-500/60"
          onKeyDown={handleKeyDown}
        >
          {/*
            No `EditorView.lineWrapping` extension is added, so long lines
            overflow instead of wrapping. Combined with `height`/`maxHeight`
            set to 100%, CodeMirror's own internal scroller (not the
            surrounding div) handles both vertical scroll (once content is
            taller than the panel) and horizontal scroll (once a line is
            wider than the panel) on its own. `min-w-0`/`min-h-0` on every
            flex ancestor above is required too - otherwise flex items
            refuse to shrink below their content's intrinsic width and the
            long line just pushes the layout wider instead of scrolling.
          */}
          <CodeMirror
            value={value}
            onChange={setValue}
            extensions={extensions}
            theme={editorTheme}
            editable={!disabled}
            placeholder="Type your answer or paste code here..."
            height="100%"
            maxHeight="100%"
            width="100%"
            style={{ height: "100%", width: "100%", fontSize: 13 }}
            basicSetup={{
              lineNumbers: language.id !== "plain",
              foldGutter: false,
              highlightActiveLine: language.id !== "plain",
            }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1 text-xs text-slate-500">
            {justSent ? (
              <>
                <Check size={12} strokeWidth={2.5} className="text-emerald-400" />
                Sent to interviewer
              </>
            ) : (
              "Ctrl/Cmd + Enter to send"
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              disabled={!value}
              className="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eraser size={13} strokeWidth={2} />
              Clear
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || !value.trim()}
              className="flex items-center gap-1.5 rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={13} strokeWidth={2} />
              Send to interviewer
            </button>
          </div>
        </div>

        {/* Backdrop - click outside the panel to close it */}
        {historyOpen && (
          <div
            className="absolute inset-0 z-10 rounded-2xl bg-slate-950/60"
            onClick={() => setHistoryOpen(false)}
            aria-hidden="true"
          />
        )}

        {/*
          Slides in from the right and overlays the editor (rather than
          sitting beside it and taking up extra width) - always mounted so
          the transform transition can animate both the open and close.
        */}
        <div
          className={`absolute inset-y-0 right-0 z-20 flex w-72 max-w-[85%] min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 transition-transform duration-300 ease-in-out ${
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
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleHistorySelect(entry)}
                  className="block w-full rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-left transition hover:border-indigo-500/60 hover:bg-slate-900"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      {entry.language || "Plain text"}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock size={10} strokeWidth={2} />
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap text-xs text-slate-300">
                    {entry.text}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
