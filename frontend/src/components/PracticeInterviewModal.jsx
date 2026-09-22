import { useState } from "react";
import { Info } from "lucide-react";
import Modal from "./Modal.jsx";

const FIELDS = [
  {
    id: "autofill",
    title: "Autofill",
    hint: "On: the practice interview is created now from this job's title, level, skills, and description. Off: those details are filled into the interview setup steps so you can review and change them before the interview is created.",
  },
  {
    id: "research",
    title: "Research and create",
    hint: "On: we search the web for this company and role, write a short brief, and save it in the interview's additional details. Question generation uses that brief. After the interview exists, the notes icon on the interview opens the full brief. Off: questions use the saved job and your usual setup only.",
  },
];

function OptionRow({ field, checked, disabled, onChange }) {
  const [showHint, setShowHint] = useState(false);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white">{field.title}</span>
            <button
              type="button"
              aria-expanded={showHint}
              aria-label={`What ${field.title} means`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowHint((open) => !open);
              }}
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-indigo-300"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </span>
          {showHint && <span className="mt-2 block text-xs leading-5 text-slate-400">{field.hint}</span>}
        </span>
      </label>
    </div>
  );
}

export default function PracticeInterviewModal({ job, busy, error, onClose, onConfirm }) {
  const [autofill, setAutofill] = useState(true);
  const [research, setResearch] = useState(false);
  const values = { autofill, research };

  let actionLabel = "Continue to setup";
  if (busy && research) actionLabel = "Researching...";
  else if (busy) actionLabel = "Creating interview...";
  else if (autofill && research) actionLabel = "Research and create";
  else if (autofill) actionLabel = "Create interview";
  else if (research) actionLabel = "Research, then continue";

  return (
    <Modal title="Practice for this role" onClose={busy ? () => {} : onClose}>
      <p className="text-sm text-slate-400">
        {job.role}
        {job.company ? ` at ${job.company}` : ""}. Autofill is on by default, so one click still creates the interview. Turn it off to edit the setup first.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {FIELDS.map((field) => (
          <OptionRow
            key={field.id}
            field={field}
            checked={values[field.id]}
            disabled={busy}
            onChange={field.id === "autofill" ? setAutofill : setResearch}
          />
        ))}
      </div>
      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm({ autofill, research })}
          disabled={busy}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:opacity-60"
        >
          {actionLabel}
        </button>
      </div>
    </Modal>
  );
}
