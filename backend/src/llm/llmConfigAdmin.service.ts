import { ApiError } from "../common/errors/api-error";
import {
  deleteLlmApiKey,
  deleteLlmSetting,
  insertLlmApiKey,
  upsertLlmSetting,
  type LlmSettingRow,
} from "../repositories/llmConfig.repository";
import { defaultPromptFor } from "./defaultPrompts";
import {
  defaultModelFor,
  defaultProviderFor,
  environmentApiKey,
  listCachedApiKeys,
  loadLlmConfigForAdmin,
  readCachedApiKey,
  readCachedLlmSetting,
  replaceCachedLlmSetting,
} from "./llmConfig.store";
import {
  LLM_FEATURES,
  REASONING_EFFORTS,
  findLlmFeature,
  type LlmProviderName,
} from "./llmFeatures";

const MAX_PROMPT_CHARS = 100_000;
const MAX_NAME_CHARS = 80;
const MAX_MODEL_CHARS = 120;
const MAX_KEY_CHARS = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameText(left: string, right: string) {
  return left.replace(/\r\n/g, "\n").trim() === right.replace(/\r\n/g, "\n").trim();
}

function maskKey(apiKey: string | null) {
  if (!apiKey) return null;
  const tail = apiKey.slice(-4);
  return tail ? `••••${tail}` : "••••";
}

function hasOverride(row: LlmSettingRow) {
  return Boolean(
    row.displayName ||
      row.provider ||
      row.model ||
      row.apiKeyId ||
      row.systemPrompt ||
      row.fastMode != null ||
      row.reasoningEffort ||
      row.maxTokens != null
  );
}

function presentApiKey(id: string) {
  const key = readCachedApiKey(id);
  if (!key) return null;
  return {
    id: key.id,
    label: key.label,
    provider: key.provider,
    apiKey: key.apiKey,
    apiKeyHint: maskKey(key.apiKey),
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

function presentFeature(featureKey: string) {
  const feature = findLlmFeature(featureKey);
  if (!feature) return null;
  const row = readCachedLlmSetting(feature.key);
  const provider = row?.provider || defaultProviderFor(feature);
  const model = row?.model || defaultModelFor(feature, provider);
  const defaultPrompt = defaultPromptFor(feature.key);
  const customPrompt = row?.systemPrompt?.trim() ? row.systemPrompt : "";
  const envKey = environmentApiKey(provider);
  const linked = row?.apiKeyId ? readCachedApiKey(row.apiKeyId) : null;
  const savedKey = linked && linked.provider === provider ? linked : null;
  return {
    key: feature.key,
    group: feature.group,
    name: row?.displayName || feature.name,
    defaultName: feature.name,
    description: feature.description,
    providers: feature.providers,
    provider,
    defaultProvider: defaultProviderFor(feature),
    defaultModels: Object.fromEntries(feature.providers.map((item) => [item, defaultModelFor(feature, item)])),
    model,
    defaultModel: defaultModelFor(feature, provider),
    fastMode: row?.fastMode ?? feature.fastMode,
    defaultFastMode: feature.fastMode,
    reasoningEffort: row?.reasoningEffort || "",
    maxTokens: row?.maxTokens ?? feature.maxTokens,
    defaultMaxTokens: feature.maxTokens,
    maxTokensHint: feature.maxTokensHint,
    promptNote: feature.promptNote,
    usesSampling: feature.key !== "realtime_interview",
    systemPrompt: customPrompt || defaultPrompt,
    defaultPrompt,
    promptSource: customPrompt ? "database" : "default",
    apiKeyId: savedKey?.id || null,
    apiKeyLabel: savedKey?.label || null,
    apiKeyHint: savedKey ? maskKey(savedKey.apiKey) : null,
    apiKeySource: savedKey ? "database" : envKey ? "environment" : "missing",
    updatedAt: row?.updatedAt || null,
  };
}

export async function listManagedModels() {
  await loadLlmConfigForAdmin();
  return {
    features: LLM_FEATURES.map((feature) => presentFeature(feature.key)).filter(Boolean),
  };
}

export async function listManagedApiKeys() {
  await loadLlmConfigForAdmin();
  return {
    keys: listCachedApiKeys().map((key) => presentApiKey(key.id)).filter(Boolean),
  };
}

export async function createManagedApiKey(body: Record<string, unknown>) {
  await loadLlmConfigForAdmin();
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) throw new ApiError(400, "Name is required");
  if (label.length > MAX_NAME_CHARS) {
    throw new ApiError(400, `Name must be ${MAX_NAME_CHARS} characters or fewer`);
  }

  const providerRaw = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  if (providerRaw !== "openai" && providerRaw !== "cursor") {
    throw new ApiError(400, "Provider must be OpenAI or Cursor");
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) throw new ApiError(400, "API key is required");
  if (apiKey.length > MAX_KEY_CHARS) throw new ApiError(400, "API key is too long");

  const inserted = await insertLlmApiKey({ label, provider: providerRaw, apiKey });
  await loadLlmConfigForAdmin();
  const view = presentApiKey(inserted.id);
  if (!view) throw new ApiError(500, "Could not save this API key");
  return { key: view };
}

export async function deleteManagedApiKey(id: string) {
  if (!UUID_RE.test(id)) throw new ApiError(400, "A valid API key id is required");
  await loadLlmConfigForAdmin();
  if (!readCachedApiKey(id)) throw new ApiError(404, "API key not found");
  const deleted = await deleteLlmApiKey(id);
  if (!deleted) throw new ApiError(404, "API key not found");
  await loadLlmConfigForAdmin();
  return { ok: true };
}

function requireFeature(featureKey: string) {
  const feature = findLlmFeature(featureKey);
  if (!feature) throw new ApiError(404, "That model feature was not found");
  return feature;
}

export async function updateManagedModel(featureKey: string, body: Record<string, unknown>) {
  await loadLlmConfigForAdmin();
  const feature = requireFeature(featureKey);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length > MAX_NAME_CHARS) {
    throw new ApiError(400, `Name must be ${MAX_NAME_CHARS} characters or fewer`);
  }

  const providerRaw = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  if (providerRaw !== "openai" && providerRaw !== "cursor") {
    throw new ApiError(400, "Provider must be OpenAI or Cursor");
  }
  if (!feature.providers.includes(providerRaw)) {
    throw new ApiError(400, `${feature.name} only supports ${feature.providers.join(" or ")}`);
  }
  const provider = providerRaw as LlmProviderName;

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) throw new ApiError(400, "Model is required");
  if (model.length > MAX_MODEL_CHARS) {
    throw new ApiError(400, `Model must be ${MAX_MODEL_CHARS} characters or fewer`);
  }

  const fastMode = body.fastMode === true;
  const reasoningRaw = typeof body.reasoningEffort === "string" ? body.reasoningEffort.trim().toLowerCase() : "";
  if (reasoningRaw && !REASONING_EFFORTS.includes(reasoningRaw as (typeof REASONING_EFFORTS)[number])) {
    throw new ApiError(400, "Thinking must be none, minimal, low, medium, high, or extra high");
  }

  let maxTokens: number | null = null;
  if (body.maxTokens != null && body.maxTokens !== "") {
    const parsed = Number(body.maxTokens);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200_000) {
      throw new ApiError(400, "Max tokens must be a whole number from 1 to 200000");
    }
    maxTokens = parsed;
  }

  const prompt = typeof body.systemPrompt === "string" ? body.systemPrompt.replace(/\r\n/g, "\n") : "";
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new ApiError(400, "Prompt is too long");
  }

  let apiKeyId: string | null = null;
  if (body.apiKeyId != null && body.apiKeyId !== "") {
    if (typeof body.apiKeyId !== "string" || !UUID_RE.test(body.apiKeyId)) {
      throw new ApiError(400, "Choose a saved API key");
    }
    const key = readCachedApiKey(body.apiKeyId);
    if (!key) throw new ApiError(400, "Choose a saved API key");
    if (key.provider !== provider) {
      throw new ApiError(400, "That API key is for a different provider");
    }
    apiKeyId = key.id;
  }

  const defaultPrompt = defaultPromptFor(feature.key);
  const defaultProvider = defaultProviderFor(feature);
  const defaultModel = defaultModelFor(feature, provider);

  const row: LlmSettingRow = {
    featureKey: feature.key,
    displayName: name && name !== feature.name ? name : null,
    provider: provider === defaultProvider ? null : provider,
    model: model === defaultModel ? null : model,
    apiKeyId,
    systemPrompt: !prompt.trim() || sameText(prompt, defaultPrompt) ? null : prompt,
    fastMode: fastMode === feature.fastMode ? null : fastMode,
    reasoningEffort: reasoningRaw || null,
    maxTokens: maxTokens == null || maxTokens === feature.maxTokens ? null : maxTokens,
    updatedAt: null,
  };

  if (!hasOverride(row)) {
    await deleteLlmSetting(feature.key);
    replaceCachedLlmSetting(feature.key, null);
  } else {
    const saved = await upsertLlmSetting(row);
    replaceCachedLlmSetting(feature.key, saved);
  }

  const featureView = presentFeature(feature.key);
  if (!featureView) throw new ApiError(404, "That model feature was not found");
  return { feature: featureView };
}
