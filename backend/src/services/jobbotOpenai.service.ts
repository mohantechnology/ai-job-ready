import OpenAI from "openai";
import { writeDebugOutput } from "../lib/jobbotHtmlParser";
import {
  FILL_LLM_TIMEOUT_MS,
  FILL_RESPONSE_SCHEMA,
  INSTRUCTIONS,
  normalizeFillOutput,
  parseLlmJson,
  prepareFillRequest
} from "../prompts/jobbotFillForm";
import { resolveLlmFeature } from "../llm/llmConfig.store";
import { errorText, recordLlmUsage, statusFromError } from "./llmUsage.service";

// Ported from job-bot/backend/src/services/openaiService.js as part of
// merging the job-bot extension's backend into this one. Per the "stream
// output only" merge decision, the non-streaming branch was dropped -
// `fillFormFields` always streams now.

const clients = new Map<string, OpenAI>();
function getClient(apiKey: string) {
  const existing = clients.get(apiKey);
  if (existing) return existing;
  const created = new OpenAI({ apiKey });
  clients.set(apiKey, created);
  return created;
}

function openaiRequestBody(messages, cacheKey, cfg) {
  const body = {
    model: cfg.model,
    messages,
    // Routes repeats of this profile to the same cache machine so the
    // system + candidate-profile prefix can be reused across fills.
    prompt_cache_key: cacheKey,
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "job_application_fill",
        strict: true,
        schema: FILL_RESPONSE_SCHEMA
      }
    },
    stream: true as const,
    stream_options: { include_usage: true as const },
    ...(cfg.maxTokens != null ? { max_completion_tokens: cfg.maxTokens } : {}),
    ...(cfg.fastMode ? { service_tier: "fast" as "default" } : {}),
  };
  if (cfg.reasoningEffort) (body as any).reasoning_effort = cfg.reasoningEffort;
  return body;
}

function completionRequestOptions(signal) {
  return {
    timeout: FILL_LLM_TIMEOUT_MS,
    ...(signal ? { signal } : {})
  };
}

function chunkDeltaText(chunk) {
  const content = chunk?.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : "";
}

async function dumpOpenAI({ messages, parsed, extra }) {
  await writeDebugOutput({
    "prompt/messages.json": JSON.stringify(messages, null, 2),
    "prompt/message-system.txt": messages[0].content,
    "prompt/message-user-candidate-profile.txt": messages[1].content,
    "prompt/message-user-page-content.txt": messages[2].content,
    "openai/raw-openai-completion.json": extra,
    "openai/parsed-output.json": Object.keys(parsed).length > 0 ? JSON.stringify(parsed, null, 2) : null
  });
}

/**
 * Ask the model to find every fillable field on the page itself (straight
 * from the annotated, backend-parsed HTML) and answer each one, using
 * everything we know about the candidate: the structured `user_profile`
 * Postgres row, the free-text profile the user pasted into the extension's
 * Options page, and the page `meta` object (url/title/og tags/heading).
 *
 * Prompt, schema, and response normalization live in `prompts/jobbotFillForm.js`
 * so OpenAI / Cursor / Anthropic all share the same fill contract.
 *
 * Streams the raw completion text; the extension consumes the NDJSON
 * `delta` events this produces via the route handler.
 *
 * @param {string} pageHtml - the full job-application page HTML, annotated with `data-jobbot-id` where needed
 * @param {string} profile - free-text resume/profile info supplied by the user
 * @param {object} [meta] - page metadata from the extension (`url`, `title`, og tags, `heading`, ...)
 * @param {object} [options]
 * @param {(chunk:{text:string,elapsedMs:number})=>void} [options.onDelta]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{answers:object[], timing: object}>}
 */
export async function fillFormFields(pageHtml, profile, meta, options: any = {}) {
  const cfg = await resolveLlmFeature("form_fill", INSTRUCTIONS);
  if (!cfg.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }
  const { messages, cacheKey } = await prepareFillRequest(pageHtml, profile, meta, {
    ...options,
    systemPrompt: cfg.systemPrompt,
  });
  const onDelta = typeof options.onDelta === "function" ? options.onDelta : null;
  const body = openaiRequestBody(messages, cacheKey, cfg);
  const track = {
    userId: options.userId,
    provider: "openai" as const,
    apiKeyProvider: "openai" as const,
    model: cfg.model,
    feature: "form_fill",
    serviceTier: cfg.fastMode ? "fast" : null,
  };

  const llmStartedAt = Date.now();
  let ttfbMs = null;
  let raw = "";
  let usage = null;

  try {
    const completion = await getClient(cfg.apiKey).chat.completions.create(
      body,
      completionRequestOptions(options.signal)
    );

    for await (const chunk of completion) {
      if (chunk?.usage) usage = chunk.usage;
      const text = chunkDeltaText(chunk);
      if (!text) continue;
      if (ttfbMs == null) {
        ttfbMs = Date.now() - llmStartedAt;
        console.log(`[openai stream] first token ${ttfbMs}ms`);
      }
      raw += text;
      onDelta?.({ text, elapsedMs: Date.now() - llmStartedAt });
    }

    const totalMs = Date.now() - llmStartedAt;
    const timing = { ttfbMs, totalMs, chars: raw.length };
    console.log(
      `[openai stream] done ttfb=${ttfbMs ?? "n/a"}ms total=${totalMs}ms chars=${raw.length}`
    );

    const parsed = parseLlmJson(raw || "{}");
    await dumpOpenAI({
      messages,
      parsed,
      extra: JSON.stringify({ stream: true, usage, timing, result: raw }, null, 2)
    });
    await recordLlmUsage({
      ...track,
      status: "success",
      usage,
      durationMs: totalMs,
      ttfbMs,
    });

    return { ...normalizeFillOutput(parsed), timing };
  } catch (err) {
    await recordLlmUsage({
      ...track,
      status: statusFromError(err),
      usage,
      durationMs: Date.now() - llmStartedAt,
      ttfbMs,
      errorMessage: errorText(err),
    });
    throw err;
  }
}
