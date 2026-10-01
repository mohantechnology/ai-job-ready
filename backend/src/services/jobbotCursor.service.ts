import { existsSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { env } from "../config/env";
import { writeDebugOutput } from "../lib/jobbotHtmlParser";
import {
  FILL_LLM_TIMEOUT_MS,
  INSTRUCTIONS,
  fillMessagesToPrompt,
  normalizeFillOutput,
  parseLlmJson,
  prepareFillRequest
} from "../prompts/jobbotFillForm";
import { resolveLlmFeature } from "../llm/llmConfig.store";
import { cursorModelId, errorText, recordLlmUsage, statusFromError } from "./llmUsage.service";

// Ported from job-bot/backend/src/services/cursorService.js as part of
// merging the job-bot extension's backend into this one. Per the "stream
// output only" merge decision, the non-streaming branch was dropped -
// `fillFormFields` always streams now (equivalent to the old
// `fillFormFieldsStream` helper).

const CURSOR_STORE_DIR = path.resolve(__dirname, "../../.cursor-agent-store");
const nodeRequire = createRequire(__filename);

let AgentCtor;
let localStore;

function ensureRipgrepPath() {
  const existing = process.env.CURSOR_RIPGREP_PATH;
  if (existing && path.isAbsolute(existing) && existsSync(existing)) return;

  // pnpm/npm do not hoist `@cursor/sdk-<platform>` to this package, but the
  // SDK itself can resolve its optional platform binary. The local executor
  // reads CURSOR_RIPGREP_PATH at startup; without it, ignore mapping throws.
  const sdkRequire = createRequire(nodeRequire.resolve("@cursor/sdk"));
  const platformId = `${process.platform}-${process.arch}`;
  let pkgJson;
  try {
    pkgJson = sdkRequire.resolve(`@cursor/sdk-${platformId}/package.json`);
  } catch {
    return;
  }
  const rgName = process.platform === "win32" ? "rg.exe" : "rg";
  const rgPath = path.join(path.dirname(pkgJson), "bin", rgName);
  if (existsSync(rgPath)) {
    process.env.CURSOR_RIPGREP_PATH = rgPath;
  }
}

async function getCursorSdk() {
  if (!AgentCtor || !localStore) {
    ensureRipgrepPath();
    const sdk = await import("@cursor/sdk");
    AgentCtor = sdk.Agent;
    // Node < 22.13 has no `node:sqlite`; JSONL is the portable local store.
    localStore = new sdk.JsonlLocalAgentStore(CURSOR_STORE_DIR);
  }
  return { Agent: AgentCtor, store: localStore };
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function assertCursorResult(result) {
  if (result?.status === "error") {
    throw new Error(result.error?.message || "Cursor run failed");
  }
  if (result?.status === "cancelled") {
    throw new Error("Cursor run was cancelled");
  }
}

async function dumpCursorFill({ messages, prompt, result, raw, parsed, thinking }) {
  await writeDebugOutput({
    "prompt/messages.json": JSON.stringify(messages, null, 2),
    "prompt/message-system.txt": messages[0].content,
    "prompt/message-user-candidate-profile.txt": messages[1].content,
    "prompt/message-user-page-content.txt": messages[2].content,
    "prompt/cursor-prompt.txt": prompt,
    ...(typeof thinking === "string" ? { "cursor/thinking.txt": thinking } : {}),
    "cursor/raw-cursor-result.json": JSON.stringify(
      {
        id: result?.id,
        status: result?.status,
        model: result?.model,
        durationMs: result?.durationMs,
        usage: result?.usage,
        result: raw
      },
      null,
      2
    ),
    "cursor/parsed-output.json": Object.keys(parsed).length > 0 ? JSON.stringify(parsed, null, 2) : null
  });
}

function cursorAgentOptions(apiKey, modelId, store) {
  return {
    apiKey,
    model: { id: modelId },
    // Text-only: do not offer file/shell tools for a JSON fill response.
    tools: [],
    local: { cwd: process.cwd(), settingSources: [], store }
  };
}

export type CursorTextResult = {
  text: string;
  usage: unknown;
  model: string;
  durationMs: number;
};

// One-shot text prompt with tools disabled. Used by resume prefill,
// job extract, and job summary. Returns token usage when Cursor sends it.
export async function runCursorTextPromptDetailed(
  prompt,
  options: { apiKey?: string; model?: string } = {}
): Promise<CursorTextResult> {
  const apiKey = (options.apiKey || process.env.CURSOR_API_KEY || env.cursorApiKey || "").trim();
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is not set");
  }

  const modelId = (options.model || process.env.CURSOR_MODEL || env.cursorModel || "composer-2.5").trim();
  const { Agent, store } = await getCursorSdk();
  const agent = await Agent.create(cursorAgentOptions(apiKey, modelId, store));
  const startedAt = Date.now();

  try {
    let streamed = "";
    const run = await agent.send(prompt, {
      onDelta: ({ update }) => {
        if (update?.type === "text-delta" && typeof update.text === "string") {
          streamed += update.text;
        }
      },
    });
    const result = await withTimeout(run.wait(), FILL_LLM_TIMEOUT_MS, "Cursor prompt");
    assertCursorResult(result);
    return {
      text: result?.result || streamed || "",
      usage: result?.usage ?? null,
      model: cursorModelId(result, modelId),
      durationMs: Number(result?.durationMs) || Date.now() - startedAt,
    };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

export async function runCursorTextPrompt(prompt) {
  const result = await runCursorTextPromptDetailed(prompt);
  return result.text;
}

/**
 * Same fill contract as OpenAI (`prompts/jobbotFillForm.js`), sent through
 * the Cursor SDK as a streamed prompt. Tools are disabled so the model only
 * returns JSON text — no repo edits.
 *
 * @param {string} pageHtml
 * @param {string} profile
 * @param {object} [meta]
 * @param {object} [options]
 * @param {(chunk:{text:string,elapsedMs:number})=>void} [options.onDelta]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{answers:object[], timing: object}>}
 */
export async function fillFormFields(pageHtml, profile, meta, options: any = {}) {
  const cfg = await resolveLlmFeature("form_fill_cursor", INSTRUCTIONS);
  const apiKey = cfg.apiKey.trim();
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is not set");
  }

  const { messages } = await prepareFillRequest(pageHtml, profile, meta, {
    ...options,
    systemPrompt: cfg.systemPrompt,
  });
  const prompt = fillMessagesToPrompt(messages);
  const modelId = cfg.model;

  const onDelta = typeof options.onDelta === "function" ? options.onDelta : null;
  const { Agent, store } = await getCursorSdk();
  const setupStartedAt = Date.now();
  const agent = await Agent.create(cursorAgentOptions(apiKey, modelId, store));
  const setupMs = Date.now() - setupStartedAt;
  const track = {
    userId: options.userId,
    provider: "cursor" as const,
    apiKeyProvider: "cursor" as const,
    feature: "form_fill",
    model: modelId,
  };

  let run;
  const onAbort = () => {
    run?.cancel?.().catch(() => {});
  };
  if (options.signal) {
    if (options.signal.aborted) {
      await agent[Symbol.asyncDispose]();
      await recordLlmUsage({
        ...track,
        status: "cancelled",
        durationMs: Date.now() - setupStartedAt,
        errorMessage: "Cursor fill was aborted",
      });
      throw new Error("Cursor fill was aborted");
    }
    options.signal.addEventListener("abort", onAbort, { once: true });
  }

  const llmStartedAt = Date.now();
  let usage = null;
  let model = modelId;
  let ttfbMs = null;
  let durationMs = null;
  try {
    let streamed = "";
    let thinking = "";

    run = await agent.send(prompt, {
      onDelta: ({ update }) => {
        const elapsedMs = Date.now() - llmStartedAt;
        const type = update?.type || "(no-type)";

        if (type === "thinking-delta" && typeof update.text === "string" && update.text) {
          thinking += update.text;
          return;
        }

        if (type !== "text-delta" || typeof update.text !== "string" || !update.text) {
          return;
        }
        if (ttfbMs == null) {
          ttfbMs = elapsedMs;
          console.log(`[cursor stream] first token ${ttfbMs}ms (setup ${setupMs}ms)`);
        }
        streamed += update.text;
        onDelta?.({ text: update.text, elapsedMs });
      }
    });

    const result = await withTimeout(run.wait(), FILL_LLM_TIMEOUT_MS, "Cursor fill");
    const totalMs = Date.now() - llmStartedAt;
    durationMs = totalMs;
    usage = result?.usage ?? null;
    model = cursorModelId(result, modelId);

    assertCursorResult(result);

    const raw = result?.result || streamed || "";
    if (ttfbMs == null) {
      console.log(
        `[cursor stream] no text-delta events; ttfb equals total ${totalMs}ms (setup ${setupMs}ms) thinking=${thinking.length}`
      );
    } else {
      console.log(
        `[cursor stream] done ttfb=${ttfbMs}ms total=${totalMs}ms setup=${setupMs}ms chars=${raw.length} thinking=${thinking.length}`
      );
    }

    const parsed = parseLlmJson(raw);
    await dumpCursorFill({ messages, prompt, result, raw, parsed, thinking });
    await recordLlmUsage({
      ...track,
      model,
      status: "success",
      usage,
      durationMs: totalMs,
      ttfbMs,
    });
    return {
      ...normalizeFillOutput(parsed),
      timing: { ttfbMs, totalMs, setupMs, chars: raw.length }
    };
  } catch (err) {
    await recordLlmUsage({
      ...track,
      model,
      status: statusFromError(err),
      usage,
      durationMs: durationMs ?? Date.now() - llmStartedAt,
      ttfbMs,
      errorMessage: errorText(err),
    });
    throw err;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    await agent[Symbol.asyncDispose]();
  }
}
