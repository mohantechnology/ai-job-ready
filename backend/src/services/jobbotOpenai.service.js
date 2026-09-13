import OpenAI from "openai";
import { writeDebugOutput } from "../lib/jobbotHtmlParser.js";
import {
  FILL_LLM_TIMEOUT_MS,
  FILL_RESPONSE_SCHEMA,
  normalizeFillOutput,
  parseLlmJson,
  prepareFillRequest
} from "../prompts/jobbotFillForm.js";

// Ported from job-bot/backend/src/services/openaiService.js as part of
// merging the job-bot extension's backend into this one. Per the "stream
// output only" merge decision, the non-streaming branch was dropped -
// `fillFormFields` always streams now.

let client;
function getClient() {
  // Lazy-init so a missing key fails per-request (caught by the route
  // handler) instead of crashing the whole server at startup.
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "missing-key" });
  }
  return client;
}

function openaiRequestBody(messages, cacheKey) {
  return {
    model: "gpt-5-nano", // gpt-5-nano gpt-4.1-nano gpt-4o-mini
    messages,
    // Routes repeats of this profile to the same cache machine so the
    // system + candidate-profile prefix can be reused across fills.
    prompt_cache_key: cacheKey,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "job_application_fill",
        strict: true,
        schema: FILL_RESPONSE_SCHEMA
      }
    },
    service_tier: "fast",
    max_completion_tokens: 20000,
    stream: true,
    stream_options: { include_usage: true }
  };
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
export async function fillFormFields(pageHtml, profile, meta, options = {}) {
  const { messages, cacheKey } = await prepareFillRequest(pageHtml, profile, meta, options);
  const onDelta = typeof options.onDelta === "function" ? options.onDelta : null;

  const llmStartedAt = Date.now();
  let ttfbMs = null;
  let raw = "";
  let usage = null;

  const completion = await getClient().chat.completions.create(
    openaiRequestBody(messages, cacheKey),
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
  console.log("openai usage -------------------");
  console.log(usage ? JSON.stringify(usage) : "(none)");

  const parsed = parseLlmJson(raw || "{}");
  await dumpOpenAI({
    messages,
    parsed,
    extra: JSON.stringify({ stream: true, usage, timing, result: raw }, null, 2)
  });

  return { ...normalizeFillOutput(parsed), timing };
}
