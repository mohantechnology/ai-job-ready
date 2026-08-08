import { useEffect, useRef } from "react";
import { Code2 } from "lucide-react";

export default function TranscriptPanel({ transcript }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript]);

  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      {transcript.length === 0 && (
        <p className="m-auto text-sm text-slate-500">The conversation transcript will appear here...</p>
      )}

      <div className="space-y-3">
        {transcript.map((entry) => (
          <div key={entry.id} className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                entry.role === "user"
                  ? "bg-indigo-500/20 text-indigo-100"
                  : "bg-slate-800/80 text-slate-200"
              }`}
            >
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {entry.role === "user" ? "You" : "Interviewer"}
                {entry.kind === "text" && (
                  <span className="flex items-center gap-1 rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-medium normal-case text-slate-300">
                    <Code2 size={10} strokeWidth={2} />
                    {entry.language || "text"}
                  </span>
                )}
              </p>
              {entry.kind === "text" ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-indigo-100">{entry.text}</pre>
              ) : (
                <p>{entry.text || "..."}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
