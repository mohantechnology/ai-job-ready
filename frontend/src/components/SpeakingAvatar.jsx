const RING_RADIUS = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function SpeakingAvatar({ label, icon: Icon, isSpeaking, colorClass, level, muted }) {
  const hasLevelRing = typeof level === "number";
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, level || 0)));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex h-28 w-28 items-center justify-center">
        {isSpeaking && (
          <>
            <span
              className={`absolute inset-0 rounded-full ${colorClass} animate-speak-ring`}
              style={{ animationDelay: "0ms" }}
            />
            <span
              className={`absolute inset-0 rounded-full ${colorClass} animate-speak-ring`}
              style={{ animationDelay: "350ms" }}
            />
          </>
        )}

        {hasLevelRing && (
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              stroke={muted ? "#f87171" : "#34d399"}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-100 ease-out"
            />
          </svg>
        )}

        <div
          className={`relative flex h-24 w-24 items-center justify-center rounded-full shadow-lg ring-2 transition-transform ${
            muted
              ? "bg-red-500/20 ring-red-500/40"
              : isSpeaking
              ? `${colorClass} ring-white/40 animate-speak-pulse`
              : "bg-slate-800 ring-slate-700"
          }`}
        >
          <Icon size={32} className={muted ? "text-red-300" : "text-white"} strokeWidth={2} />
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
        <span
          className={`h-2 w-2 rounded-full ${
            muted ? "bg-red-400" : isSpeaking ? "bg-emerald-400" : "bg-slate-600"
          }`}
        />
        {label}
        {muted && <span className="text-xs font-normal text-red-300">(muted)</span>}
      </div>
    </div>
  );
}
