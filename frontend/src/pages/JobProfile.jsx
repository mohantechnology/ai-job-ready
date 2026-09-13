import { useEffect, useState } from "react";
import { Pencil, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { deleteUserProfileField, getUserProfile, updateUserProfile } from "../lib/api.js";

const NEW_FIELD_KEY = "__new__";

function fieldToDraft(field) {
  return {
    label: field?.label || "",
    key: field?.key || "",
    answers: field?.answer?.length ? field.answer.map((a) => a.value) : [""],
  };
}

export default function JobProfile() {
  const [details, setDetails] = useState(null);
  const [newDetails, setNewDetails] = useState([]);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setError("");
    getUserProfile()
      .then(({ details, newDetails }) => {
        setDetails(details || []);
        setNewDetails(newDetails || []);
      })
      .catch((err) => setError(err.message || "Could not load your job profile."));
  }

  function startEdit(field) {
    setError("");
    setEditingKey(field.key);
    setDraft(fieldToDraft(field));
  }

  function startAddNew() {
    setError("");
    setEditingKey(NEW_FIELD_KEY);
    setDraft(fieldToDraft(null));
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft(null);
  }

  function updateDraftAnswer(index, value) {
    setDraft((d) => ({ ...d, answers: d.answers.map((a, i) => (i === index ? value : a)) }));
  }

  function addDraftAnswer() {
    setDraft((d) => ({ ...d, answers: [...d.answers, ""] }));
  }

  function removeDraftAnswer(index) {
    setDraft((d) => ({ ...d, answers: d.answers.length > 1 ? d.answers.filter((_, i) => i !== index) : d.answers }));
  }

  async function saveDraft() {
    const label = draft.label.trim();
    const answer = draft.answers.map((v) => v.trim()).filter(Boolean).map((value) => ({ value }));

    if (!label) {
      setError("A question needs a label.");
      return;
    }
    if (answer.length === 0) {
      setError("Add at least one answer.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const field = { label, answer };
      if (draft.key) field.key = draft.key;
      const updated = await updateUserProfile([field]);
      setDetails(updated.details);
      cancelEdit();
    } catch (err) {
      setError(err.message || "Failed to save this field.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(key) {
    setError("");
    setBusyKey(key);
    try {
      const updated = await deleteUserProfileField(key);
      setDetails(updated.details);
    } catch (err) {
      setError(err.message || "Failed to remove this field.");
    } finally {
      setBusyKey(null);
    }
  }

  async function promoteNewDetail(field) {
    setError("");
    setBusyKey(field.key);
    try {
      const updated = await updateUserProfile([field]);
      setDetails(updated.details);
    } catch (err) {
      setError(err.message || "Failed to add this to your profile.");
    } finally {
      setBusyKey(null);
    }
  }

  const promotedKeys = new Set((details || []).map((d) => d.key));
  const unpromotedNewDetails = newDetails.filter((d) => !promotedKeys.has(d.key));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Job profile</h1>
          <p className="mt-1 text-sm text-slate-400">
            Facts saved about you - used to tailor interviews and auto-fill job applications. A question can have
            more than one saved answer.
          </p>
        </div>
        {editingKey !== NEW_FIELD_KEY && (
          <button
            type="button"
            onClick={startAddNew}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
          >
            <Plus className="h-4 w-4" />
            Add detail
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {details === null && !error && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          Loading your profile...
        </div>
      )}

      {details !== null && (
        <div className="grid gap-4 sm:grid-cols-2">
          {editingKey === NEW_FIELD_KEY && (
            <FieldEditor
              draft={draft}
              saving={saving}
              onChangeLabel={(label) => setDraft((d) => ({ ...d, label }))}
              onChangeAnswer={updateDraftAnswer}
              onAddAnswer={addDraftAnswer}
              onRemoveAnswer={removeDraftAnswer}
              onSave={saveDraft}
              onCancel={cancelEdit}
            />
          )}

          {details.map((field) =>
            editingKey === field.key ? (
              <FieldEditor
                key={field.key}
                draft={draft}
                saving={saving}
                onChangeLabel={(label) => setDraft((d) => ({ ...d, label }))}
                onChangeAnswer={updateDraftAnswer}
                onAddAnswer={addDraftAnswer}
                onRemoveAnswer={removeDraftAnswer}
                onSave={saveDraft}
                onCancel={cancelEdit}
              />
            ) : (
              <div
                key={field.key}
                className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">{field.label}</h3>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(field)}
                      title="Edit"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-indigo-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(field.key)}
                      disabled={busyKey === field.key}
                      title="Remove"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {field.answer.map((a, i) => (
                    <span
                      key={`${field.key}-${i}`}
                      className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300"
                    >
                      {a.value}
                    </span>
                  ))}
                </div>
              </div>
            )
          )}

          {details.length === 0 && editingKey !== NEW_FIELD_KEY && (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center text-sm text-slate-400 sm:col-span-2">
              Nothing saved yet. Click "Add detail" to start building your profile.
            </div>
          )}
        </div>
      )}

      {unpromotedNewDetails.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-1 text-base font-semibold text-white">Recently confirmed from applications</h2>
          <p className="mb-4 text-xs text-slate-500">
            Picked up while auto-filling job applications. Add any of these to your profile above to reuse them.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {unpromotedNewDetails.map((field) => (
              <div
                key={field.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-300">{field.label}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {field.answer.map((a) => a.value).join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => promoteNewDetail(field)}
                  disabled={busyKey === field.key}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-indigo-400/50 hover:text-indigo-300 disabled:opacity-40"
                >
                  <Sparkles className="h-3 w-3" />
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldEditor({ draft, saving, onChangeLabel, onChangeAnswer, onAddAnswer, onRemoveAnswer, onSave, onCancel }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-indigo-400/40 bg-slate-900/80 p-5 shadow-lg shadow-black/20 ring-1 ring-indigo-500/10">
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
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => onChangeAnswer(index, e.target.value)}
              placeholder={`Answer ${index + 1}`}
              maxLength={2000}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400"
            />
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
