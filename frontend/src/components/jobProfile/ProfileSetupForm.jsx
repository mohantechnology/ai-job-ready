import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import CalendarField from "./CalendarField.jsx";
import {
  buildFormValues,
  collectFilledFields,
  emptyRepeatEntry,
  groupFields,
  requiredFieldErrors,
  shouldHideField,
} from "./profileFields.js";

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400";

export function SchemaFieldInput({ field, value, onChange }) {
  if (field.type === "select") {
    return (
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Select {field.label.toLowerCase()}</option>
        {(field.options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        rows={4}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        maxLength={2000}
        className={`${inputClass} resize-y`}
      />
    );
  }

  if (field.type === "tags") {
    return <TagInput values={Array.isArray(value) ? value : []} placeholder={field.placeholder} onChange={onChange} />;
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500"
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "month" || field.type === "date") {
    return (
      <CalendarField
        mode={field.type === "date" ? "date" : "month"}
        value={value || ""}
        onChange={onChange}
        className={inputClass}
      />
    );
  }

  if (field.type === "duration") {
    const duration = value && typeof value === "object" ? value : { years: "", months: "" };
    return (
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          min="0"
          value={duration.years || ""}
          onChange={(e) => onChange({ ...duration, years: e.target.value })}
          placeholder="Years"
          className={inputClass}
        />
        <input
          type="number"
          min="0"
          max="11"
          value={duration.months || ""}
          onChange={(e) => onChange({ ...duration, months: e.target.value })}
          placeholder="Months"
          className={inputClass}
        />
      </div>
    );
  }

  const inputType = field.type === "number" ? "number" : field.type || "text";
  return (
    <input
      type={inputType}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={inputClass}
    />
  );
}

function FieldLabel({ field, hideTitle }) {
  if (hideTitle || field.type === "checkbox") return null;
  return (
    <span className="text-xs font-medium text-slate-300">
      {field.label}
      {field.required ? <span className="text-indigo-300"> *</span> : null}
    </span>
  );
}

function TagInput({ values, placeholder, onChange }) {
  const [draft, setDraft] = useState("");

  function addTag(raw) {
    const tag = raw.trim();
    if (!tag || values.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...values, tag]);
    setDraft("");
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(values.filter((item) => item !== tag))}
              className="text-slate-500 hover:text-red-300"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(draft);
          }
        }}
        onBlur={() => {
          if (draft.trim()) addTag(draft);
        }}
        className={inputClass}
      />
    </div>
  );
}

function ExtraFieldsEditor({ field, items, onChange }) {
  const list = Array.isArray(items) ? items : [];

  function updateItem(index, patch) {
    onChange(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="sm:col-span-2 space-y-3">
      {list.map((item, index) => (
        <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={item.label || ""}
            onChange={(e) => updateItem(index, { label: e.target.value })}
            placeholder="Label, e.g. Twitter"
            className={inputClass}
          />
          <input
            type="text"
            value={item.value || ""}
            onChange={(e) => updateItem(index, { value: e.target.value })}
            placeholder="Value"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(list.filter((_, i) => i !== index))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-300"
            aria-label="Remove extra contact"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, { label: "", value: "" }])}
        className="flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200"
      >
        <Plus className="h-3.5 w-3.5" />
        {field.addLabel || "Add extra field"}
      </button>
    </div>
  );
}

function RepeatEditor({ field, entries, onChange }) {
  const list = Array.isArray(entries) && entries.length ? entries : [emptyRepeatEntry(field)];

  function updateEntry(index, key, value) {
    onChange(list.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)));
  }

  return (
    <div className="space-y-4">
      {list.map((entry, index) => (
        <div key={index} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {field.itemLabel || field.label} {index + 1}
            </h4>
            {list.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(list.filter((_, i) => i !== index))}
                className="text-xs text-slate-500 hover:text-red-300"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(field.fields || [])
              .filter((sub) => !shouldHideField(sub, entry))
              .map((sub) => (
                <div
                  key={sub.key}
                  className={`flex flex-col gap-1.5 ${sub.type === "textarea" || sub.type === "tags" || sub.type === "checkbox" ? "sm:col-span-2" : ""}`}
                >
                  <FieldLabel field={sub} />
                  <SchemaFieldInput
                    field={sub}
                    value={entry[sub.key]}
                    onChange={(next) => updateEntry(index, sub.key, next)}
                  />
                </div>
              ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, emptyRepeatEntry(field)])}
        className="flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200"
      >
        <Plus className="h-3.5 w-3.5" />
        {field.addLabel || "Add another"}
      </button>
    </div>
  );
}

function FieldGroups({ fields, values, onChange }) {
  const groups = useMemo(() => groupFields(fields), [fields]);

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.name}>
          <h3 className="mb-4 text-base font-semibold text-white">{group.label}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => {
              if (shouldHideField(field, values)) return null;

              if (field.type === "repeat") {
                return (
                  <div key={field.key} className="sm:col-span-2">
                    <RepeatEditor
                      field={field}
                      entries={values[field.key]}
                      onChange={(next) => onChange(field.key, next)}
                    />
                  </div>
                );
              }

              if (field.type === "extraFields") {
                return (
                  <ExtraFieldsEditor
                    key={field.key}
                    field={field}
                    items={values[field.key]}
                    onChange={(next) => onChange(field.key, next)}
                  />
                );
              }

              return (
                <div
                  key={field.key}
                  className={`flex flex-col gap-1.5 ${field.type === "textarea" || field.type === "tags" || field.type === "duration" ? "sm:col-span-2" : ""}`}
                >
                  <FieldLabel field={field} />
                  <SchemaFieldInput
                    field={field}
                    value={values[field.key]}
                    onChange={(next) => onChange(field.key, next)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function ProfileSetupForm({ schema, saving, error, onCancel, onSave, initialValues = null, prefilled = false }) {
  const details = schema?.details || [];
  const extraDetails = schema?.extraDetails || [];
  const [step, setStep] = useState("details");
  const [values, setValues] = useState(() => buildFormValues([...details, ...extraDetails], initialValues));
  const [localError, setLocalError] = useState("");

  function updateValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function goToExtra() {
    const missing = requiredFieldErrors(details, values);
    if (missing.length) {
      setLocalError(`Please fill: ${missing.join(", ")}.`);
      return;
    }
    setLocalError("");
    setStep("extra");
  }

  function save(includeExtra) {
    const missing = requiredFieldErrors(details, values);
    if (missing.length) {
      setLocalError(`Please fill: ${missing.join(", ")}.`);
      setStep("details");
      return;
    }

    const fields = collectFilledFields(details, values);
    if (includeExtra) {
      fields.push(...collectFilledFields(extraDetails, values));
    }
    onSave(fields);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg shadow-black/20">
      <div className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-400">
        <span className={step === "details" ? "text-indigo-300" : "text-slate-500"}>1. Basic details</span>
        <span className="text-slate-700">/</span>
        <span className={step === "extra" ? "text-indigo-300" : "text-slate-500"}>2. Extra details</span>
      </div>

      {prefilled && (
        <div className="mb-4 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-100">
          These answers were filled from your resume. Check them, then save your profile.
        </div>
      )}

      {(localError || error) && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {localError || error}
        </div>
      )}

      {step === "details" ? (
        <FieldGroups fields={details} values={values} onChange={updateValue} />
      ) : (
        <FieldGroups fields={extraDetails} values={values} onChange={updateValue} />
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200"
        >
          Cancel
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {step === "details" ? (
            <button
              type="button"
              onClick={goToExtra}
              className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
            >
              Continue
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep("details")}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:shadow-none"
              >
                <Plus className="h-4 w-4" />
                {saving ? "Saving..." : "Save profile"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
