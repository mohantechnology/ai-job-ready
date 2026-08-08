export default function IconButton({
  icon: Icon,
  label,
  active = false,
  danger = false,
  disabled = false,
  onClick,
  size = 18,
  badge,
}) {
  const activeClass = danger
    ? "bg-red-500 text-white shadow-lg shadow-red-500/20"
    : "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full transition ${
        active
          ? activeClass
          : disabled
          ? "cursor-not-allowed bg-slate-800/50 text-slate-600"
          : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
      }`}
    >
      <Icon size={size} strokeWidth={2} />
      {badge && (
        <span className="absolute -bottom-1.5 rounded-full bg-slate-950 px-1 text-[8px] font-semibold uppercase tracking-wide text-slate-400 ring-1 ring-slate-700">
          {badge}
        </span>
      )}
    </button>
  );
}
