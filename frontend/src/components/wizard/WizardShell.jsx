export default function WizardShell({ step, totalSteps, title, subtitle, children, footer }) {
  const progress = Math.round((step / totalSteps) * 100);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-400">
            <span>
              Step {step} of {totalSteps}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl shadow-black/40 backdrop-blur">
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8 flex items-center justify-between">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
