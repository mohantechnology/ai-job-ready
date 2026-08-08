export default function NumberStepper({ value, onChange, min = 1, max = 30 }) {
  function clamp(next) {
    return Math.min(max, Math.max(min, next));
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-lg text-slate-200 hover:border-indigo-400 hover:text-indigo-300"
      >
        &minus;
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        className="w-20 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-center text-lg font-semibold text-white outline-none focus:border-indigo-400"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-lg text-slate-200 hover:border-indigo-400 hover:text-indigo-300"
      >
        +
      </button>
    </div>
  );
}
