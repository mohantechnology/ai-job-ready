const STATUS_STYLES = {
  created: "bg-amber-500/15 text-amber-300",
  in_progress: "bg-sky-500/15 text-sky-300",
  completed: "bg-emerald-500/15 text-emerald-300",
};

const STATUS_LABELS = {
  created: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

export default function InterviewCard({ interview, onClick }) {
  const { jobTitle, role, typeOfInterview, typeOfInterviewOther, topics, numberOfQuestions, status, createdAt, summary } =
    interview;
  const typeLabel = typeOfInterview === "other" ? typeOfInterviewOther || "other" : typeOfInterview;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left shadow-lg shadow-black/20 transition hover:border-indigo-400/60 hover:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{jobTitle || "Untitled interview"}</h3>
          <p className="mt-1 text-xs capitalize text-slate-400">
            {role} &middot; {typeLabel}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {new Date(createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            STATUS_STYLES[status] || "bg-slate-800 text-slate-300"
          }`}
        >
          {STATUS_LABELS[status] || status}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {topics.map((topic) => (
          <span
            key={topic}
            className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300"
          >
            {topic}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{numberOfQuestions} questions</span>
        {status === "completed" && summary && (
          <span className="font-semibold text-emerald-300">Score: {summary.overallScore}/100</span>
        )}
        {status !== "completed" && <span className="font-medium text-indigo-300">Click to start &rarr;</span>}
        {status === "completed" && <span className="font-medium text-indigo-300">View results &rarr;</span>}
      </div>
    </button>
  );
}
