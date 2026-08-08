import { Mic, MicOff } from "lucide-react";

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Mic toggle button with the live input-level ring drawn around it, meant to
// sit right next to the "End call" button.
export default function MicControl({ enabled, level, onClick, disabled, size = 56 }) {
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, level || 0)));
  const Icon = enabled ? Mic : MicOff;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={enabled ? "Mute microphone" : "Unmute microphone"}
      aria-label={enabled ? "Mute microphone" : "Unmute microphone"}
      className="relative flex items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40"
      style={{ height: size, width: size }}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle
          cx="32"
          cy="32"
          r={RING_RADIUS}
          fill="none"
          stroke={enabled ? "#34d399" : "#f87171"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-100 ease-out"
        />
      </svg>
      <span
        className={`relative flex h-10 w-10 items-center justify-center rounded-full ring-2 transition ${
          enabled ? "bg-slate-800 text-slate-200 ring-slate-700" : "bg-red-500/20 text-red-300 ring-red-500/40"
        }`}
      >
        <Icon size={18} strokeWidth={2} />
      </span>
    </button>
  );
}
