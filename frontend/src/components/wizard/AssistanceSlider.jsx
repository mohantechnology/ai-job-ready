const LEVELS = [
  {
    value: "always",
    label: "Assist when wrong",
    description: "The interviewer steps in and explains whenever your answer is wrong or incomplete.",
  },
  {
    value: "on_request",
    label: "Assist when asked",
    description: "The interviewer only helps or explains if you explicitly ask for it.",
  },
  {
    value: "never",
    label: "Never assist",
    description: "The interviewer never helps or explains, even if you ask - just like a real, strict interview.",
  },
];

export default function AssistanceSlider({ value, onChange }) {
  const activeIndex = LEVELS.findIndex((l) => l.value === value);
  const safeIndex = activeIndex === -1 ? 1 : activeIndex;
  const current = LEVELS[safeIndex];

  return (
    <div className="flex flex-col items-center gap-6 py-2">
      <div className="w-full">
        <input
          type="range"
          min={0}
          max={LEVELS.length - 1}
          step={1}
          value={safeIndex}
          onChange={(e) => onChange(LEVELS[Number(e.target.value)].value)}
          className="w-full accent-indigo-500"
        />
        <div className="mt-2 flex justify-between text-[11px] text-slate-500">
          {LEVELS.map((l, i) => (
            <span
              key={l.value}
              className={i === safeIndex ? "font-semibold text-indigo-300" : ""}
              style={{ width: `${100 / LEVELS.length}%`, textAlign: i === 0 ? "left" : i === LEVELS.length - 1 ? "right" : "center" }}
            >
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <div className="w-full rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4 text-center">
        <p className="text-sm font-semibold text-indigo-300">{current.label}</p>
        <p className="mt-1 text-xs text-slate-400">{current.description}</p>
      </div>
    </div>
  );
}
