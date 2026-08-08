export default function OptionCard({ label, description, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition-all ${
        selected
          ? "border-indigo-400 bg-indigo-500/10 ring-1 ring-indigo-400"
          : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-800/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`font-medium ${selected ? "text-indigo-300" : "text-slate-100"}`}>{label}</span>
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
            selected ? "border-indigo-400 bg-indigo-400" : "border-slate-600"
          }`}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-slate-950" />}
        </span>
      </div>
      {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
    </button>
  );
}
