import { useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { createApiKey, deleteApiKey, listApiKeys, listManagedModels, updateManagedModel } from "../lib/api.js";
import PageFrame from "../components/layout/PageFrame.jsx";
import Modal from "../components/Modal.jsx";

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400";

const TABS = [
  { id: "keys", label: "API keys" },
  { id: "models", label: "Models" },
];

const GROUPS = [
  {
    id: "interviews",
    title: "Interviews",
    description: "Research, planned questions, grading, and the live voice session.",
  },
  {
    id: "applied_jobs",
    title: "Applied Jobs",
    description: "Reading a posting, comparing it with the profile, and filling the application.",
  },
  {
    id: "job_profile",
    title: "Job Profile",
    description: "Answers drawn from an uploaded resume.",
  },
];

const THINKING_OPTIONS = [
  { value: "", label: "Model default" },
  { value: "none", label: "None" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
];

function providerLabel(value) {
  if (value === "openai") return "OpenAI";
  if (value === "cursor") return "Cursor";
  return value || "—";
}

function thinkingLabel(value) {
  return THINKING_OPTIONS.find((option) => option.value === (value || ""))?.label || value || "Model default";
}

function keyLabel(feature) {
  if (feature.apiKeySource === "database") {
    return feature.apiKeyLabel ? `${feature.apiKeyLabel} ${feature.apiKeyHint || ""}`.trim() : feature.apiKeyHint || "Saved key";
  }
  if (feature.apiKeySource === "environment") return "Server key";
  return "No key";
}

function maskedKey(apiKey) {
  const tail = String(apiKey || "").slice(-4);
  return tail ? `••••${tail}` : "••••";
}

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-sm text-slate-200">{children}</dd>
    </div>
  );
}

export default function AdminModels() {
  const [tab, setTab] = useState("keys");
  const [features, setFeatures] = useState([]);
  const [keys, setKeys] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(() => new Set());

  const [keyLabelInput, setKeyLabelInput] = useState("");
  const [keyProvider, setKeyProvider] = useState("openai");
  const [keySecret, setKeySecret] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [fastMode, setFastMode] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [apiKeyId, setApiKeyId] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listManagedModels(), listApiKeys()])
      .then(([modelsPayload, keysPayload]) => {
        if (cancelled) return;
        setFeatures(modelsPayload.features || []);
        setKeys(keysPayload.keys || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load models.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleReveal(id) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addKey(event) {
    event.preventDefault();
    setKeyError("");
    const label = keyLabelInput.trim();
    const secret = keySecret.trim();
    if (!label) {
      setKeyError("Name is required.");
      return;
    }
    if (!secret) {
      setKeyError("API key is required.");
      return;
    }
    setAddingKey(true);
    try {
      const result = await createApiKey({ label, provider: keyProvider, apiKey: secret });
      setKeys((rows) => [...rows, result.key].sort((left, right) => left.label.localeCompare(right.label)));
      setKeyLabelInput("");
      setKeySecret("");
      setShowNewKey(false);
    } catch (err) {
      setKeyError(err.message || "Could not save this API key.");
    } finally {
      setAddingKey(false);
    }
  }

  async function removeKey(key) {
    const confirmed = window.confirm(`Delete “${key.label}”? Models using it will use the server key.`);
    if (!confirmed) return;
    setKeyError("");
    setDeletingId(key.id);
    try {
      await deleteApiKey(key.id);
      setKeys((rows) => rows.filter((row) => row.id !== key.id));
      setRevealed((current) => {
        const next = new Set(current);
        next.delete(key.id);
        return next;
      });
      const modelsPayload = await listManagedModels();
      setFeatures(modelsPayload.features || []);
      if (apiKeyId === key.id) setApiKeyId("");
    } catch (err) {
      setKeyError(err.message || "Could not delete this API key.");
    } finally {
      setDeletingId("");
    }
  }

  function openEdit(feature) {
    setEditing(feature);
    setName(feature.name || "");
    setProvider(feature.provider || "openai");
    setModel(feature.model || "");
    setFastMode(Boolean(feature.fastMode));
    setReasoningEffort(feature.reasoningEffort || "");
    setMaxTokens(feature.maxTokens == null ? "" : String(feature.maxTokens));
    setSystemPrompt(feature.systemPrompt || "");
    setApiKeyId(feature.apiKeyId || "");
    setFormError("");
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
    setFormError("");
  }

  function changeProvider(next) {
    const defaults = editing?.defaultModels || {};
    setModel((currentModel) => (currentModel === defaults[provider] ? defaults[next] || currentModel : currentModel));
    setProvider(next);
    setApiKeyId((currentId) => {
      const selected = keys.find((key) => key.id === currentId);
      return selected && selected.provider === next ? currentId : "";
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing) return;
    setFormError("");
    const trimmedName = name.trim();
    const trimmedModel = model.trim();
    if (!trimmedName) {
      setFormError("Name is required.");
      return;
    }
    if (!trimmedModel) {
      setFormError("Model is required.");
      return;
    }
    let parsedTokens = null;
    if (String(maxTokens).trim() !== "") {
      parsedTokens = Number(maxTokens);
      if (!Number.isInteger(parsedTokens) || parsedTokens < 1 || parsedTokens > 200000) {
        setFormError("Max tokens must be a whole number from 1 to 200000.");
        return;
      }
    }

    setSaving(true);
    try {
      const result = await updateManagedModel(editing.key, {
        name: trimmedName,
        provider,
        model: trimmedModel,
        fastMode,
        reasoningEffort,
        maxTokens: parsedTokens,
        systemPrompt,
        apiKeyId: apiKeyId || null,
      });
      const next = result.feature;
      setFeatures((rows) => rows.map((row) => (row.key === next.key ? next : row)));
      setEditing(null);
    } catch (err) {
      setFormError(err.message || "Could not save this model.");
    } finally {
      setSaving(false);
    }
  }

  const promptIsCustom = editing && systemPrompt.replace(/\r\n/g, "\n").trim() !== (editing.defaultPrompt || "").replace(/\r\n/g, "\n").trim();
  const providerKeys = keys.filter((key) => key.provider === provider);

  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-5">
        <header>
          <h1 className="text-lg font-semibold text-white">Manage models</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Save API keys once, then choose which key each task uses. A saved prompt replaces the one built into the app. Changes apply on the next request.
          </p>
        </header>

        <div className="flex gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-1" role="tablist" aria-label="Manage models">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`models-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`models-panel-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  selected ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        {loading && <div className="h-48 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />}

        {!loading && !error && tab === "keys" && (
          <div id="models-panel-keys" role="tabpanel" aria-labelledby="models-tab-keys" className="flex flex-col gap-4">
            <form onSubmit={addKey} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-sm font-semibold text-white">Add an API key</h2>
              <p className="mt-1 text-xs text-slate-500">The secret stays hidden in the list until you choose Show.</p>
              {keyError && (
                <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{keyError}</div>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-400">
                  Name
                  <input className={`${inputClass} mt-1.5`} value={keyLabelInput} onChange={(event) => setKeyLabelInput(event.target.value)} />
                </label>
                <label className="block text-xs font-medium text-slate-400">
                  Provider
                  <select className={`${inputClass} mt-1.5`} value={keyProvider} onChange={(event) => setKeyProvider(event.target.value)}>
                    <option value="openai">OpenAI</option>
                    <option value="cursor">Cursor</option>
                  </select>
                </label>
              </div>
              <label className="mt-4 block text-xs font-medium text-slate-400">
                API key
                <div className="mt-1.5 flex gap-2">
                  <input
                    className={`${inputClass} font-mono`}
                    type={showNewKey ? "text" : "password"}
                    autoComplete="off"
                    value={keySecret}
                    onChange={(event) => setKeySecret(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewKey((value) => !value)}
                    className="shrink-0 rounded-lg border border-slate-800 px-3 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    {showNewKey ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={addingKey}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {addingKey ? "Saving..." : "Add key"}
                </button>
              </div>
            </form>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {keys.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-500">No API keys yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3 font-medium sm:px-5">Name</th>
                        <th className="px-3 py-3 font-medium">Provider</th>
                        <th className="px-3 py-3 font-medium">Key</th>
                        <th className="px-4 py-3 font-medium sm:px-5">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => {
                        const visible = revealed.has(key.id);
                        return (
                          <tr key={key.id} className="border-t border-white/5">
                            <td className="px-4 py-3 font-medium text-slate-100 sm:px-5">{key.label}</td>
                            <td className="px-3 py-3 text-slate-300">{providerLabel(key.provider)}</td>
                            <td className="max-w-xs px-3 py-3 font-mono text-xs text-slate-400">
                              <span className="break-all">{visible ? key.apiKey : key.apiKeyHint || maskedKey(key.apiKey)}</span>
                            </td>
                            <td className="px-4 py-3 sm:px-5">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => toggleReveal(key.id)}
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                                  aria-label={visible ? `Hide ${key.label}` : `Show ${key.label}`}
                                >
                                  {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeKey(key)}
                                  disabled={deletingId === key.id}
                                  className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
                                  aria-label={`Delete ${key.label}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {!loading && !error && tab === "models" && (
          <div id="models-panel-models" role="tabpanel" aria-labelledby="models-tab-models" className="flex flex-col gap-8">
            {GROUPS.map((group) => {
              const rows = features.filter((feature) => feature.group === group.id);
              if (rows.length === 0) return null;
              return (
                <section key={group.id}>
                  <div className="mb-3">
                    <h2 className="text-sm font-semibold text-white">{group.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{group.description}</p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {rows.map((feature) => (
                      <article key={feature.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-medium text-white">{feature.name}</h3>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{feature.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openEdit(feature)}
                            className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-indigo-500/10 hover:text-indigo-200"
                            aria-label={`Edit ${feature.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                          <Detail label="Provider">{providerLabel(feature.provider)}</Detail>
                          <Detail label="Model">
                            <span className="font-mono text-xs">{feature.model}</span>
                          </Detail>
                          <Detail label="API key">{keyLabel(feature)}</Detail>
                          <Detail label="Prompt">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                feature.promptSource === "database"
                                  ? "bg-indigo-500/15 text-indigo-200"
                                  : "bg-slate-500/15 text-slate-300"
                              }`}
                            >
                              {feature.promptSource === "database" ? "Saved" : "Built-in"}
                            </span>
                          </Detail>
                          {feature.usesSampling && (
                            <>
                              <Detail label="Fast">{feature.fastMode ? "On" : "Off"}</Detail>
                              <Detail label="Thinking">{thinkingLabel(feature.reasoningEffort)}</Detail>
                              <Detail label="Max tokens">
                                <span className="tabular-nums">{feature.maxTokens != null ? feature.maxTokens : "—"}</span>
                              </Detail>
                            </>
                          )}
                        </dl>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </PageFrame>

      {editing && (
        <Modal title={`Edit ${editing.defaultName}`} onClose={closeEdit} wide>
          {formError && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{formError}</div>
          )}
          <form onSubmit={saveEdit} className="space-y-4">
            <label className="block text-xs font-medium text-slate-400">
              Name
              <input className={`${inputClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-400">
                Provider
                {editing.providers.length > 1 ? (
                  <select className={`${inputClass} mt-1.5`} value={provider} onChange={(event) => changeProvider(event.target.value)}>
                    {editing.providers.map((item) => (
                      <option key={item} value={item}>
                        {providerLabel(item)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className={`${inputClass} mt-1.5`} value={providerLabel(provider)} readOnly />
                )}
              </label>
              <label className="block text-xs font-medium text-slate-400">
                Model
                <input className={`${inputClass} mt-1.5 font-mono`} value={model} onChange={(event) => setModel(event.target.value)} />
              </label>
            </div>

            <label className="block text-xs font-medium text-slate-400">
              API key
              <select className={`${inputClass} mt-1.5`} value={apiKeyId} onChange={(event) => setApiKeyId(event.target.value)}>
                <option value="">Server key</option>
                {providerKeys.map((key) => (
                  <option key={key.id} value={key.id}>
                    {key.label} ({key.apiKeyHint || maskedKey(key.apiKey)})
                  </option>
                ))}
              </select>
              {providerKeys.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">No saved {providerLabel(provider)} keys yet. This task will use the server key.</p>
              )}
            </label>

            {editing.usesSampling ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-200">
                  <input type="checkbox" checked={fastMode} onChange={(event) => setFastMode(event.target.checked)} />
                  Fast mode
                </label>
                <label className="block text-xs font-medium text-slate-400">
                  Thinking
                  <select className={`${inputClass} mt-1.5`} value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value)}>
                    {THINKING_OPTIONS.map((option) => (
                      <option key={option.value || "default"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-400">
                  Max tokens
                  <input
                    className={`${inputClass} mt-1.5`}
                    inputMode="numeric"
                    value={maxTokens}
                    placeholder={editing.maxTokensHint}
                    onChange={(event) => setMaxTokens(event.target.value)}
                  />
                </label>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Voice sessions use the model, API key, and prompt.</p>
            )}

            {provider === "cursor" && editing.usesSampling && (
              <p className="text-xs text-slate-500">Fast mode, thinking, and max tokens are sent on OpenAI calls. Cursor uses the model and API key.</p>
            )}

            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-400">Prompt</span>
                <button
                  type="button"
                  onClick={() => setSystemPrompt(editing.defaultPrompt || "")}
                  className="text-xs text-indigo-300 hover:text-indigo-200"
                >
                  Reset to built-in prompt
                </button>
              </div>
              <textarea
                rows={7}
                className={`${inputClass} mt-1.5 min-h-[11rem] resize-y font-mono text-xs leading-5`}
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500">
                {promptIsCustom ? "This saved prompt will be used." : "This matches the built-in prompt, so the app keeps using the code default."}{" "}
                {editing.promptNote} Drag the corner to make this taller.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeEdit} className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
