import { useEffect, useMemo, useState } from "react";
import { Plus, UserRound } from "lucide-react";
import { deleteUserProfileField, getUserProfile, getUserProfileFields, updateUserProfile } from "../lib/api.js";
import CompleteProfileModal from "../components/jobProfile/CompleteProfileModal.jsx";
import ProfileSetupForm from "../components/jobProfile/ProfileSetupForm.jsx";
import ResumeUploadPanel from "../components/jobProfile/ResumeUploadPanel.jsx";
import { ConfirmedFieldCard, FieldEditor, ProfileModal, RepeatEntryEditor, SavedFieldCard } from "../components/jobProfile/ProfileFieldCards.jsx";
import {
  answersToRepeatEntries,
  buildRepeatField,
  displayGroups,
  emptyRepeatEntry,
  schemaFieldByKey,
  splitSavedDetails,
} from "../components/jobProfile/profileFields.js";

const NEW_FIELD_KEY = "__new__";
const TABS = [
  { id: "details", label: "Details" },
  { id: "extra", label: "Extra details" },
  { id: "confirmed", label: "Recently confirmed" },
];

function fieldToDraft(field) {
  return {
    label: field?.label || "",
    key: field?.key || "",
    group: field?.group || "",
    answers: field?.answer?.length ? field.answer.map((a) => a.value) : [""],
  };
}

export default function JobProfile() {
  const [details, setDetails] = useState(null);
  const [newDetails, setNewDetails] = useState([]);
  const [schema, setSchema] = useState({ details: [], extraDetails: [] });
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryDraft, setEntryDraft] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [prefillValues, setPrefillValues] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [tab, setTab] = useState("details");

  useEffect(() => {
    load();
  }, []);

  function load() {
    setError("");
    Promise.all([getUserProfile(), getUserProfileFields().catch(() => ({ details: [], extraDetails: [] }))])
      .then(([{ details: saved, newDetails: confirmed }, fields]) => {
        setDetails(saved || []);
        setNewDetails(confirmed || []);
        setSchema({
          details: fields.details || [],
          extraDetails: fields.extraDetails || [],
        });
      })
      .catch((err) => setError(err.message || "Could not load your job profile."));
  }

  function startEdit(field) {
    setError("");
    setEditingEntry(null);
    setEntryDraft(null);
    setEditingKey(field.key);
    setDraft(fieldToDraft(field));
  }

  function startAddInGroup(groupName) {
    setError("");
    setEditingEntry(null);
    setEntryDraft(null);
    setEditingKey(NEW_FIELD_KEY);
    setDraft({ ...fieldToDraft(null), group: groupName });
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft(null);
    setEditingEntry(null);
    setEntryDraft(null);
  }

  function startEditEntry(field, index) {
    const schemaField = schemaFieldByKey(schema, field.key);
    if (!schemaField || schemaField.type !== "repeat") {
      startEdit(field);
      return;
    }
    const entries = answersToRepeatEntries(schemaField, field.answer);
    setError("");
    setEditingKey(null);
    setDraft(null);
    setEditingEntry({ key: field.key, index });
    setEntryDraft(entries[index] || emptyRepeatEntry(schemaField));
  }

  async function saveEntry() {
    const field = (details || []).find((item) => item.key === editingEntry?.key);
    const schemaField = field ? schemaFieldByKey(schema, field.key) : null;
    if (!field || !schemaField || !entryDraft) return;

    const entries = answersToRepeatEntries(schemaField, field.answer);
    entries[editingEntry.index] = entryDraft;
    const rebuilt = buildRepeatField(schemaField, entries);
    if (!rebuilt) {
      setError("Fill in at least one input before saving.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const updated = await updateUserProfile([rebuilt]);
      setDetails(updated.details);
      setEditingEntry(null);
      setEntryDraft(null);
    } catch (err) {
      setError(err.message || "Failed to save this entry.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(field, index) {
    const schemaField = schemaFieldByKey(schema, field.key);
    if (!schemaField || schemaField.type !== "repeat") {
      handleDelete(field.key);
      return;
    }

    const entries = answersToRepeatEntries(schemaField, field.answer);
    entries.splice(index, 1);
    const rebuilt = buildRepeatField(schemaField, entries);
    setError("");
    setBusyKey(`${field.key}:${index}`);
    try {
      const updated = rebuilt
        ? await updateUserProfile([rebuilt])
        : await deleteUserProfileField(field.key);
      setDetails(updated.details);
      if (editingEntry?.key === field.key) {
        setEditingEntry(null);
        setEntryDraft(null);
      }
    } catch (err) {
      setError(err.message || "Failed to remove this entry.");
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmPendingDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    if (target.kind === "entry") await deleteEntry(target.field, target.index);
    else await handleDelete(target.field.key);
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
      const original = (details || []).find((item) => item.key === draft.key);
      const field = { label, answer };
      if (draft.key) field.key = draft.key;
      const group = draft.group || original?.group || (tab === "extra" ? "extraDetails" : "");
      if (group) field.group = group;
      if (original?.answer) {
        field.answer = answer.map((item, index) =>
          original.answer[index]?.data ? { ...item, data: original.answer[index].data } : item
        );
      }
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
      const updated = await updateUserProfile([{ ...field, group: field.group || "extraDetails" }]);
      setDetails(updated.details);
      setTab("extra");
    } catch (err) {
      setError(err.message || "Failed to add this to your profile.");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveSetup(fields) {
    setSaving(true);
    setError("");
    try {
      const updated = await updateUserProfile(fields);
      setDetails(updated.details);
      setSetupOpen(false);
      setTab("details");
    } catch (err) {
      setError(err.message || "Failed to save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const hasProfile = Array.isArray(details) && details.length > 0;
  const { basic, extra } = useMemo(() => splitSavedDetails(details || [], schema), [details, schema]);
  const promotedKeys = new Set((details || []).map((d) => d.key));
  const unpromotedNewDetails = newDetails.filter((d) => !promotedKeys.has(d.key));

  const tabFields = tab === "details" ? basic : extra;
  const groups = displayGroups(tab === "extra" ? "extra" : "details", tabFields);
  const editingField = editingKey && editingKey !== NEW_FIELD_KEY ? (details || []).find((item) => item.key === editingKey) : null;
  const editingRepeatField = editingEntry ? (details || []).find((item) => item.key === editingEntry.key) : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Job profile</h1>
          <p className="mt-1 text-sm text-slate-400">
            Facts saved about you — used to tailor interviews and auto-fill job applications.
          </p>
        </div>
      </div>

      {error && !setupOpen && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {details === null && !error && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          Loading your profile...
        </div>
      )}

      {details !== null && !hasProfile && !setupOpen && !resumeOpen && (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/50 px-8 py-12 text-center shadow-lg shadow-black/20">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
              <UserRound className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-white">Complete your profile</h2>
            <p className="mt-2 text-sm text-slate-400">
              Add the basics once. We will reuse them when auto-filling job applications.
            </p>
            <button
              type="button"
              onClick={() => setShowStartModal(true)}
              className="mt-6 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
            >
              Complete your profile
            </button>
          </div>
        </div>
      )}

      {resumeOpen && !setupOpen && (
        <ResumeUploadPanel
          onCancel={() => {
            setResumeOpen(false);
            setShowStartModal(true);
          }}
          onFilled={(values) => {
            setPrefillValues(values);
            setResumeOpen(false);
            setSetupOpen(true);
          }}
        />
      )}

      {setupOpen && (
        <ProfileSetupForm
          key={prefillValues ? "resume" : "manual"}
          schema={schema}
          saving={saving}
          error={error}
          initialValues={prefillValues}
          prefilled={Boolean(prefillValues)}
          onCancel={() => {
            setSetupOpen(false);
            setPrefillValues(null);
            setError("");
          }}
          onSave={saveSetup}
        />
      )}

      {hasProfile && !setupOpen && (
        <>
          <div className="mb-6 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-1">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  cancelEdit();
                  setTab(item.id);
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  tab === item.id ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.label}
                {item.id === "confirmed" && unpromotedNewDetails.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
                    {unpromotedNewDetails.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {tab !== "confirmed" && (
            <div className="space-y-8">
              {groups.map((group) => {
                const showAdd = tab === "details" || group.name === "extraDetails";
                return (
                <section key={group.name}>
                  {group.name !== "other" && (
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        {group.label}
                      </h2>
                      {showAdd && (
                        <button
                          type="button"
                          onClick={() => startAddInGroup(group.name)}
                          className="flex items-center gap-1.5 text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add detail
                        </button>
                      )}
                    </div>
                  )}
                  {group.fields.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {group.fields.map((field) => {
                      const schemaField = schemaFieldByKey(schema, field.key);
                      return (
                        <SavedFieldCard
                          key={field.key}
                          field={field}
                          schemaField={schemaField}
                          busy={busyKey === field.key || String(busyKey || "").startsWith(`${field.key}:`)}
                          onEdit={() => startEdit(field)}
                          onDelete={() => setPendingDelete({ kind: "field", field, label: field.label })}
                          onEditEntry={(index) => startEditEntry(field, index)}
                          onDeleteEntry={(index) =>
                            setPendingDelete({
                              kind: "entry",
                              field,
                              index,
                              label: field.answer?.[index]?.value || field.label,
                            })
                          }
                        />
                      );
                    })}
                  </div>
                  )}
                </section>
                );
              })}

              {tab === "extra" && tabFields.length === 0 && (
                <p className="-mt-4 text-sm text-slate-500">
                  No extra details yet. Add a summary, cover letter, or anything you confirmed on an application.
                </p>
              )}
            </div>
          )}

          {tab === "confirmed" && (
            <div>
              <p className="mb-4 text-xs text-slate-500">
                Picked up while auto-filling job applications. Add any of these into Extra details to reuse them.
              </p>
              {unpromotedNewDetails.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center text-sm text-slate-400">
                  Nothing confirmed from applications yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {unpromotedNewDetails.map((field) => (
                    <ConfirmedFieldCard
                      key={field.key}
                      field={field}
                      busy={busyKey === field.key}
                      onAdd={() => promoteNewDetail(field)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {(editingField || editingKey === NEW_FIELD_KEY) && draft && (
        <ProfileModal
          title={editingKey === NEW_FIELD_KEY ? draft.label || "Add detail" : draft.label || editingField.label || "Edit"}
          onClose={cancelEdit}
        >
          <FieldEditor
            embedded
            multiline={tab === "extra" || draft.group === "extraDetails"}
            draft={draft}
            saving={saving}
            onChangeLabel={(label) => setDraft((current) => ({ ...current, label }))}
            onChangeAnswer={updateDraftAnswer}
            onAddAnswer={addDraftAnswer}
            onRemoveAnswer={removeDraftAnswer}
            onSave={saveDraft}
            onCancel={cancelEdit}
          />
        </ProfileModal>
      )}

      {editingRepeatField && entryDraft && (
        <ProfileModal title={editingRepeatField.label || "Edit"} onClose={() => { setEditingEntry(null); setEntryDraft(null); }}>
          <RepeatEntryEditor
            schemaField={schemaFieldByKey(schema, editingRepeatField.key)}
            value={entryDraft}
            saving={saving}
            onChange={(key, value) => setEntryDraft((current) => ({ ...current, [key]: value }))}
            onSave={saveEntry}
            onCancel={() => {
              setEditingEntry(null);
              setEntryDraft(null);
            }}
          />
        </ProfileModal>
      )}

      {pendingDelete && (
        <ProfileModal title="Remove this?" onClose={() => !saving && setPendingDelete(null)}>
          <p className="text-sm text-slate-300">
            Remove <span className="font-medium text-white">{pendingDelete.label}</span>? This cannot be undone.
          </p>
          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPendingDelete}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
            >
              Delete
            </button>
          </div>
        </ProfileModal>
      )}

      {showStartModal && (
        <CompleteProfileModal
          onClose={() => setShowStartModal(false)}
          onFillFromResume={() => {
            setShowStartModal(false);
            setPrefillValues(null);
            setResumeOpen(true);
          }}
          onFillManually={() => {
            setShowStartModal(false);
            setPrefillValues(null);
            setSetupOpen(true);
          }}
        />
      )}
    </div>
  );
}
