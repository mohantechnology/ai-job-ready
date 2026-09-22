import { Plus, Save, Sparkles, Trash2, Pencil, X } from "lucide-react";
import { SchemaFieldInput } from "./ProfileSetupForm.jsx";
import { shouldHideField } from "./profileFields.js";

export function ProfileModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/40"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FieldEditor({ draft, saving, onChangeLabel, onChangeAnswer, onAddAnswer, onRemoveAnswer, onSave, onCancel, embedded = false, multiline = false }) {
  const answerClass =
    "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400";

  return (
    <div className={embedded ? "flex flex-col gap-3" : "flex flex-col gap-3 rounded-2xl border border-indigo-400/40 bg-slate-900/80 p-5 shadow-lg shadow-black/20 ring-1 ring-indigo-500/10"}>
      <input
        type="text"
        value={draft.label}
        onChange={(e) => onChangeLabel(e.target.value)}
        placeholder="Question, e.g. What are your key strengths?"
        maxLength={400}
        autoFocus
        className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-indigo-400"
      />

      <div className="flex flex-col gap-2">
        {draft.answers.map((answer, index) => (
          <div key={index} className={`flex gap-2 ${multiline ? "items-start" : "items-center"}`}>
            {multiline ? (
              <textarea
                rows={4}
                value={answer}
                onChange={(e) => onChangeAnswer(index, e.target.value)}
                placeholder={`Answer ${index + 1}`}
                maxLength={2000}
                className={`${answerClass} resize-y text-sm`}
              />
            ) : (
              <input
                type="text"
                value={answer}
                onChange={(e) => onChangeAnswer(index, e.target.value)}
                placeholder={`Answer ${index + 1}`}
                maxLength={2000}
                className={`${answerClass} text-xs`}
              />
            )}
            {draft.answers.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveAnswer(index)}
                title="Remove answer"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddAnswer}
        className="flex items-center gap-1.5 self-start text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
      >
        <Plus className="h-3.5 w-3.5" />
        Add another answer
      </button>

      <div className="mt-1 flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function subLabel(schemaField, key) {
  const match = schemaField?.fields?.find((sub) => sub.key === key);
  if (match?.label) return match.label;
  const spaced = key.replace(/([A-Z])/g, " $1");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function displayDataValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Yes";
  return String(value);
}

export function RepeatEntryEditor({ schemaField, value, saving, onChange, onSave, onCancel }) {
  const fields = (schemaField?.fields || []).filter((sub) => !shouldHideField(sub, value));

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((sub) => (
          <div
            key={sub.key}
            className={`flex flex-col gap-1.5 ${sub.type === "textarea" || sub.type === "tags" || sub.type === "checkbox" ? "sm:col-span-2" : ""}`}
          >
            {sub.type !== "checkbox" && (
              <span className="text-xs font-medium text-slate-300">{sub.label}</span>
            )}
            <SchemaFieldInput field={sub} value={value?.[sub.key]} onChange={(next) => onChange(sub.key, next)} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:shadow-none"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

export function SavedFieldCard({
  field,
  schemaField,
  busy,
  onEdit,
  onDelete,
  onEditEntry,
  onDeleteEntry,
}) {
  const answers = field.answer || [];
  const structured = Boolean(schemaField?.type === "repeat" && answers.some((item) => item?.data && typeof item.data === "object"));

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/20 ${structured ? "sm:col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{field.label}</h3>
        {!structured && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              title="Edit"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-indigo-300"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              title="Remove"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {structured ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {answers.map((item, index) => (
              <div key={`${field.key}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-white">{item.value}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditEntry?.(index)}
                      title="Edit"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-indigo-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteEntry?.(index)}
                      disabled={busy}
                      title="Remove"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <dl className="space-y-1">
                  {Object.entries(item.data || {})
                    .filter(([, value]) => value !== false && value !== "")
                    .map(([name, value]) => (
                      <div key={name} className="text-[11px] text-slate-400">
                        <span className="text-slate-500">{subLabel(schemaField, name)}: </span>
                        <span className="whitespace-pre-wrap text-slate-300">{displayDataValue(value)}</span>
                      </div>
                    ))}
                </dl>
              </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {answers.map((a, i) => {
            const long = (a.value || "").length > 80 || (a.value || "").includes("\n");
            return (
              <span
                key={`${field.key}-${i}`}
                className={
                  long
                    ? "whitespace-pre-wrap rounded-lg bg-slate-800 px-3 py-2 text-xs leading-5 text-slate-300"
                    : "w-fit rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300"
                }
              >
                {a.value}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ConfirmedFieldCard({ field, busy, onAdd }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-300">{field.label}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{(field.answer || []).map((a) => a.value).join(", ")}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-indigo-400/50 hover:text-indigo-300 disabled:opacity-40"
      >
        <Sparkles className="h-3 w-3" />
        Add to extra details
      </button>
    </div>
  );
}
