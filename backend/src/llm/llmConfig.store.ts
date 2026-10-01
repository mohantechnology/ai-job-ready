import { env } from "../config/env";
import {
  findLlmFeature,
  type LlmFeatureDefinition,
  type LlmProviderName,
} from "./llmFeatures";
import {
  deleteLlmSetting,
  listLlmApiKeys,
  listLlmSettings,
  migrateInlineApiKeys,
  upsertLlmSetting,
  type LlmApiKeyRow,
  type LlmSettingRow,
} from "../repositories/llmConfig.repository";

const RETRY_MS = 15_000;

export type ResolvedLlmFeature = {
  featureKey: string;
  displayName: string;
  provider: LlmProviderName;
  model: string;
  apiKey: string;
  apiKeySource: "database" | "environment" | "missing";
  systemPrompt: string;
  promptSource: "database" | "default";
  fastMode: boolean;
  reasoningEffort: string | null;
  maxTokens: number | null;
};

let settings = new Map<string, LlmSettingRow>();
let apiKeys = new Map<string, LlmApiKeyRow>();
let ready = false;
let loading: Promise<void> | null = null;
let retryAfter = 0;

function providerFromEnv(token: LlmFeatureDefinition["provider"]): LlmProviderName {
  if (token === "fromJobExtract") {
    return String(env.jobExtractProvider || "cursor").trim().toLowerCase() === "openai" ? "openai" : "cursor";
  }
  if (token === "fromProfilePrefill") {
    return String(env.profilePrefillProvider || "cursor").trim().toLowerCase() === "openai" ? "openai" : "cursor";
  }
  return token;
}

function modelFromEnv(token: string, provider: LlmProviderName) {
  if (token === "openaiChat") return env.openaiChatModel;
  if (token === "openaiRealtime") return env.openaiRealtimeModel;
  if (token === "cursor") return env.cursorModel || "composer-2.5";
  if (token === "formFill") {
    return provider === "openai" ? "gpt-5-nano" : env.cursorModel || "composer-2.5";
  }
  if (token === "matchProvider") {
    return provider === "openai" ? env.openaiChatModel : env.cursorModel || "composer-2.5";
  }
  return token;
}

export function environmentApiKey(provider: LlmProviderName) {
  if (provider === "cursor") return (process.env.CURSOR_API_KEY || env.cursorApiKey || "").trim();
  return (env.openaiApiKey || "").trim();
}

export function readCachedLlmSetting(featureKey: string) {
  return settings.get(featureKey) || null;
}

export function replaceCachedLlmSetting(featureKey: string, row: LlmSettingRow | null) {
  ready = true;
  retryAfter = 0;
  if (!row) settings.delete(featureKey);
  else settings.set(featureKey, row);
}

export function readCachedApiKey(id: string) {
  return apiKeys.get(id) || null;
}

export function listCachedApiKeys() {
  return [...apiKeys.values()];
}

function settingHasOverride(row: LlmSettingRow | null) {
  if (!row) return false;
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

async function mergeLegacyFormFill() {
  const cursor = settings.get("form_fill_cursor");
  if (!cursor) return;
  if (!settingHasOverride(settings.get("form_fill") || null) && settingHasOverride(cursor)) {
    const saved = await upsertLlmSetting({ ...cursor, featureKey: "form_fill" });
    settings.set("form_fill", saved);
  }
  await deleteLlmSetting("form_fill_cursor");
  settings.delete("form_fill_cursor");
}

async function pullSettings() {
  await migrateInlineApiKeys();
  const [rows, keys] = await Promise.all([listLlmSettings(), listLlmApiKeys()]);
  settings = new Map(rows.map((row) => [row.featureKey, row]));
  apiKeys = new Map(keys.map((key) => [key.id, key]));
  await mergeLegacyFormFill();
  ready = true;
  retryAfter = 0;
}

/** Loads every saved override once. Later calls read memory until an admin save updates it. */
export async function ensureLlmConfigLoaded() {
  if (ready) return;
  if (loading) {
    await loading;
    return;
  }
  if (Date.now() < retryAfter) return;

  loading = pullSettings()
    .catch((err) => {
      ready = false;
      retryAfter = Date.now() + RETRY_MS;
      console.error(
        "[llm-config] Could not load model settings. Using built-in defaults until the next try.",
        err instanceof Error ? err.message : err
      );
    })
    .finally(() => {
      loading = null;
    });
  await loading;
}

/** Admin reads must fail loudly when the settings table is unreachable. */
export async function loadLlmConfigForAdmin() {
  await pullSettings();
}

export function defaultProviderFor(feature: LlmFeatureDefinition) {
  return providerFromEnv(feature.provider);
}

export function defaultModelFor(feature: LlmFeatureDefinition, provider: LlmProviderName = defaultProviderFor(feature)) {
  return modelFromEnv(feature.model, provider);
}

export async function resolveLlmFeature(featureKey: string, defaultPrompt: string): Promise<ResolvedLlmFeature> {
  await ensureLlmConfigLoaded();
  const feature = findLlmFeature(featureKey);
  if (!feature) {
    throw new Error(`Unknown LLM feature: ${featureKey}`);
  }

  const row = settings.get(featureKey) || null;
  const provider = row?.provider || defaultProviderFor(feature);
  const model = row?.model || defaultModelFor(feature, provider);
  const linked = row?.apiKeyId ? apiKeys.get(row.apiKeyId) : null;
  const savedKey = linked && linked.provider === provider ? linked.apiKey : "";
  const apiKey = savedKey || environmentApiKey(provider);
  const customPrompt = row?.systemPrompt?.trim() ? row.systemPrompt : "";

  return {
    featureKey,
    displayName: row?.displayName || feature.name,
    provider,
    model,
    apiKey,
    apiKeySource: savedKey ? "database" : apiKey ? "environment" : "missing",
    systemPrompt: customPrompt || defaultPrompt,
    promptSource: customPrompt ? "database" : "default",
    fastMode: row?.fastMode ?? feature.fastMode,
    reasoningEffort: row?.reasoningEffort ?? null,
    maxTokens: row?.maxTokens ?? feature.maxTokens,
  };
}

export function applyOpenAiChatOptions(body: Record<string, unknown>, cfg: ResolvedLlmFeature) {
  body.model = cfg.model;
  if (cfg.maxTokens != null) body.max_completion_tokens = cfg.maxTokens;
  if (cfg.fastMode) body.service_tier = "fast";
  if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;
}

export function applyOpenAiResponsesOptions(body: Record<string, unknown>, cfg: ResolvedLlmFeature, maxOutputTokens: number) {
  body.model = cfg.model;
  body.max_output_tokens = maxOutputTokens;
  if (cfg.fastMode) body.service_tier = "fast";
  if (cfg.reasoningEffort) body.reasoning = { effort: cfg.reasoningEffort };
}
