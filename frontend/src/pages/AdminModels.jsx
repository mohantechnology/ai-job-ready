import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { listManagedModels, updateManagedModel } from "../lib/api.js";
import PageFrame from "../components/layout/PageFrame.jsx";
import Modal from "../components/Modal.jsx";

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400";

const THINKING_OPTIONS = [
  { value: "", label: "Model default" },
  { value: "none", label: "None" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
];

function thinkingLabel(value) {
  return THINKING_OPTIONS.find((option) => option.value === (value || ""))?.label || value || "Model default";
}

function keyLabel(feature) {
  if (feature.apiKeySource === "database") return feature.apiKeyHint || "Custom key";
  if (feature.apiKeySource === "environment") return "Server key";
  return "No key";
}

export default function AdminModels() {
  const [features, setFeatures] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [fastMode, setFastMode] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listManagedModels()
      .then((payload) => {
        if (!cancelled) setFeatures(payload.features || []);
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

  function openEdit(feature) {
    setEditing(feature);
    setName(feature.name || "");
    setProvider(feature.provider || "openai");
    setModel(feature.model || "");
    setFastMode(Boolean(feature.fastMode));
    setReasoningEffort(feature.reasoningEffort || "");
    setMaxTokens(feature.maxTokens == null ? "" : String(feature.maxTokens));
    setSystemPrompt(feature.systemPrompt || "");
    setApiKey("");
    setClearKey(false);
    setShowKey(false);
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

    const payload = {
      name: trimmedName,
      provider,
      model: trimmedModel,
      fastMode,
      reasoningEffort,
      maxTokens: parsedTokens,
      systemPrompt,
      apiKeyAction: clearKey ? "clear" : apiKey.trim() ? "set" : "keep",
    };
    if (payload.apiKeyAction === "set") payload.apiKey = apiKey.trim();

    setSaving(true);
    try {
      const result = await updateManagedModel(editing.key, payload);
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

  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-5">
        <header>
          <h1 className="text-lg font-semibold text-white">Manage models</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Each feature uses a saved prompt when one is stored. Otherwise it uses the prompt built into the app. Saves apply on the next request, without restarting the backend.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        )}

        {loading && <div className="h-48 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />}

        {!loading && !error && (
          <section className="overflow-hidden rounded-2xl border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Feature</th>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Fast</th>
                    <th className="px-4 py-3 font-medium">Thinking</th>
                    <th className="px-4 py-3 font-medium">Max tokens</th>
                    <th className="px-4 py-3 font-medium">Prompt</th>
                    <th className="px-4 py-3 font-medium">API key</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Edit</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {features.map((feature) => (
                    <tr key={feature.key} className="text-slate-200">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{feature.name}</p>
                        <p className="mt-0.5 max-w-xs text-xs text-slate-500">{feature.description}</p>
                      </td>
                      <td className="px-4 py-3 capitalize">{feature.provider}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{feature.model}</td>
                      <td className="px-4 py-3">{feature.usesSampling ? (feature.fastMode ? "On" : "Off") : "—"}</td>
                      <td className="px-4 py-3">{feature.usesSampling ? thinkingLabel(feature.reasoningEffort) : "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{feature.usesSampling && feature.maxTokens != null ? feature.maxTokens : "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            feature.promptSource === "database"
                              ? "bg-indigo-500/15 text-indigo-200"
                              : "bg-slate-500/15 text-slate-300"
                          }`}
                        >
                          {feature.promptSource === "database" ? "Saved" : "Built-in"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{keyLabel(feature)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openEdit(feature)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-500/10 hover:text-indigo-200"
                          aria-label={`Edit ${feature.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
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
                  <select className={`${inputClass} mt-1.5 capitalize`} value={provider} onChange={(event) => changeProvider(event.target.value)}>
                    {editing.providers.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className={`${inputClass} mt-1.5 capitalize`} value={provider} readOnly />
                )}
              </label>
              <label className="block text-xs font-medium text-slate-400">
                Model
                <input className={`${inputClass} mt-1.5 font-mono`} value={model} onChange={(event) => setModel(event.target.value)} />
              </label>
            </div>

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
                <span className="text-xs font-medium text-slate-400">API key</span>
                <span className="text-xs text-slate-500">
                  {clearKey ? "Will use the server key" : editing.apiKeySet ? `Saved ${editing.apiKeyHint}` : keyLabel(editing)}
                </span>
              </div>
              <div className="mt-1.5 flex gap-2">
                <input
                  className={inputClass}
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  value={apiKey}
                  placeholder={editing.apiKeySet ? "Leave blank to keep the saved key" : "Leave blank to use the server key"}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setClearKey(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((value) => !value)}
                  className="shrink-0 rounded-lg border border-slate-800 px-3 text-xs text-slate-300 hover:bg-slate-800"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              {editing.apiKeySet && (
                <button
                  type="button"
                  onClick={() => {
                    setClearKey((value) => !value);
                    setApiKey("");
                  }}
                  className="mt-2 text-xs text-amber-200/90 hover:text-amber-100"
                >
                  {clearKey ? "Keep the saved key" : "Remove saved key and use the server key"}
                </button>
              )}
            </div>

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
                className={`${inputClass} mt-1.5 min-h-64 font-mono text-xs leading-5`}
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500">
                {promptIsCustom ? "This saved prompt will be used." : "This matches the built-in prompt, so the app keeps using the code default."}{" "}
                {editing.promptNote}
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
