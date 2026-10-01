import { env } from "../config/env";
import { ApiError } from "../common/errors/api-error";
import { query } from "../database/pool";

const FEATURES = new Set([
  "form_fill",
  "job_extract",
  "job_summary",
  "resume_prefill",
  "job_research",
  "question_generation",
  "interview_grading",
  "realtime_interview",
]);

const PROVIDERS = new Set(["openai", "cursor"]);
const API_KEY_PROVIDERS = new Set(["openai", "cursor", "other"]);
const STATUSES = new Set(["success", "failed", "cancelled"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TOKEN = 50_000_000;

export type LlmProvider = "openai" | "cursor";
export type ApiKeyProvider = "openai" | "cursor" | "other";
export type LlmUsageStatus = "success" | "failed" | "cancelled";

export type LlmUsageInput = {
  userId?: string | null;
  provider: LlmProvider;
  apiKeyProvider: ApiKeyProvider;
  model?: string | null;
  feature: string;
  status: LlmUsageStatus;
  serviceTier?: string | null;
  usage?: unknown;
  durationMs?: number | null;
  ttfbMs?: number | null;
  errorMessage?: string | null;
  meta?: Record<string, unknown> | null;
};

function tokenCount(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Math.round(number), MAX_TOKEN);
}

function detail(raw: any, ...keys: string[]) {
  for (const key of keys) {
    const value = raw?.[key];
    if (value != null && typeof value !== "object") return value;
  }
  return 0;
}

export function normalizeTokenUsage(raw: unknown) {
  const source = raw && typeof raw === "object" ? (raw as any) : {};
  const promptDetails = source.prompt_tokens_details || source.input_tokens_details || source.input_token_details || {};
  const completionDetails =
    source.completion_tokens_details || source.output_tokens_details || source.output_token_details || {};

  const inputTokens = tokenCount(
    detail(source, "input_tokens", "prompt_tokens", "inputTokens") || source.input_tokens || source.prompt_tokens || source.inputTokens
  );
  const outputTokens = tokenCount(
    source.output_tokens ?? source.completion_tokens ?? source.outputTokens
  );
  const cachedInputTokens = tokenCount(
    source.cached_input_tokens ??
      source.cache_read_tokens ??
      source.cacheReadTokens ??
      source.cache_read_input_tokens ??
      promptDetails.cached_tokens
  );
  const reasoningTokens = tokenCount(
    source.reasoning_tokens ?? source.reasoningTokens ?? completionDetails.reasoning_tokens
  );
  const audioInputTokens = tokenCount(
    source.audio_input_tokens ?? source.audioInputTokens ?? promptDetails.audio_tokens
  );
  const audioOutputTokens = tokenCount(
    source.audio_output_tokens ?? source.audioOutputTokens ?? completionDetails.audio_tokens
  );
  const summed = inputTokens + outputTokens;
  const totalTokens = tokenCount(source.total_tokens ?? source.totalTokens ?? summed);

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    audioInputTokens,
    audioOutputTokens,
    totalTokens,
  };
}

function clipText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function safeMeta(meta: Record<string, unknown> | null | undefined) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const next: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) continue;
    if (typeof value === "string") next[key] = value.slice(0, 80);
    else if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
    else if (typeof value === "boolean") next[key] = value;
  }
  return next;
}

function optionalMs(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(Math.round(number), 12 * 60 * 60 * 1000);
}

export async function recordLlmUsage(input: LlmUsageInput) {
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!UUID_RE.test(userId)) return;
  if (!PROVIDERS.has(input.provider) || !API_KEY_PROVIDERS.has(input.apiKeyProvider)) return;
  if (!FEATURES.has(input.feature) || !STATUSES.has(input.status)) return;

  const tokens = normalizeTokenUsage(input.usage);
  try {
    await query(
      `INSERT INTO llm_usage_events (
         user_id, provider, api_key_provider, model, feature, status, service_tier,
         input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
         audio_input_tokens, audio_output_tokens, total_tokens,
         duration_ms, ttfb_ms, error_message, meta
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11,
         $12, $13, $14,
         $15, $16, $17, $18::jsonb
       )`,
      [
        userId,
        input.provider,
        input.apiKeyProvider,
        clipText(input.model, 120) || "",
        input.feature,
        input.status,
        clipText(input.serviceTier, 40),
        tokens.inputTokens,
        tokens.cachedInputTokens,
        tokens.outputTokens,
        tokens.reasoningTokens,
        tokens.audioInputTokens,
        tokens.audioOutputTokens,
        tokens.totalTokens,
        optionalMs(input.durationMs),
        optionalMs(input.ttfbMs),
        clipText(input.errorMessage, 500),
        JSON.stringify(safeMeta(input.meta)),
      ]
    );
  } catch (err) {
    console.error("[usage] failed to record LLM call:", err instanceof Error ? err.message : err);
  }
}

export function cursorModelId(result: any, fallback: string) {
  const model = result?.model;
  if (typeof model === "string" && model.trim()) return model.trim();
  if (model && typeof model.id === "string" && model.id.trim()) return model.id.trim();
  return fallback;
}

export function errorText(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  return String(err || "LLM call failed");
}

export function statusFromError(err: unknown): LlmUsageStatus {
  const message = errorText(err);
  return /cancel/i.test(message) ? "cancelled" : "failed";
}

export async function recordRealtimeUsage(userId: string, body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Usage event must be an object");
  }
  const status = body.status;
  if (status !== "success" && status !== "failed" && status !== "cancelled") {
    throw new ApiError(400, "status must be success, failed, or cancelled");
  }
  if (body.usage != null && (typeof body.usage !== "object" || Array.isArray(body.usage))) {
    throw new ApiError(400, "usage must be an object");
  }

  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, 120)
      : env.openaiRealtimeModel;
  const interviewId =
    typeof body.interviewId === "string" && UUID_RE.test(body.interviewId) ? body.interviewId : null;

  await recordLlmUsage({
    userId,
    provider: "openai",
    apiKeyProvider: "openai",
    model,
    feature: "realtime_interview",
    status,
    serviceTier: typeof body.serviceTier === "string" ? body.serviceTier : null,
    usage: body.usage,
    durationMs: body.durationMs,
    errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : null,
    meta: interviewId ? { interviewId } : null,
  });

  return { ok: true };
}
