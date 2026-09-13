import { fillFormFields as fillFormFieldsOpenAI } from "../services/jobbotOpenai.service.js";
import { fillFormFields as fillFormFieldsCursor } from "../services/jobbotCursor.service.js";

// Ported from job-bot/backend/src/routes/formRoutes.js as part of merging
// the job-bot extension's backend into this one. Per the "stream output
// only" merge decision, every response is now an NDJSON stream - there is
// no more non-streaming JSON fallback (the old `FORCE_STREAM` flag and the
// `stream` request field are both gone; streaming is the only mode).

function parseFillBody(req, res) {
  const { pageHtml, profile, meta } = req.body || {};

  console.log("pageHtml length", typeof pageHtml === "string" ? pageHtml.length : 0);
  if (typeof pageHtml !== "string" || pageHtml.trim().length === 0) {
    res.status(400).json({ error: "`pageHtml` must be a non-empty string" });
    return null;
  }
  if (meta != null && (typeof meta !== "object" || Array.isArray(meta))) {
    res.status(400).json({ error: "`meta` must be an object" });
    return null;
  }

  return { pageHtml, profile, meta };
}

function openFillStream(res) {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.socket?.setNoDelay?.(true);
}

function writeFillEvent(res, event) {
  if (res.writableEnded) return;
  res.write(`${JSON.stringify(event)}\n`);
}

async function handleFill(req, res, fillFn, provider) {
  const payload = parseFillBody(req, res);
  if (!payload) return;

  const abort = new AbortController();
  // `req` "close" fires when the incoming body is fully read (after
  // express.json()), not when the client hangs up. Watch the response
  // socket instead, and only abort if we have not finished writing.
  const onClientGone = () => {
    if (!res.writableEnded && !res.writableFinished) abort.abort();
  };
  res.on("close", onClientGone);
  req.on("aborted", onClientGone);

  try {
    openFillStream(res);
    writeFillEvent(res, { type: "start", provider });

    const result = await fillFn(payload.pageHtml, payload.profile, payload.meta, {
      signal: abort.signal,
      onDelta: (chunk) => {
        writeFillEvent(res, {
          type: "delta",
          text: chunk.text,
          elapsedMs: chunk.elapsedMs
        });
      }
    });

    writeFillEvent(res, {
      type: "done",
      answers: result.answers,
      timing: result.timing
    });
    res.end();
  } catch (err) {
    console.error(`jobbot form/fill${provider === "cursor" ? "/cursor" : ""} failed:`, err);
    const message = `Failed to get a response from ${provider === "cursor" ? "Cursor" : "OpenAI"}`;
    if (res.headersSent) {
      writeFillEvent(res, { type: "error", error: err?.message || message });
      if (!res.writableEnded) res.end();
      return;
    }
    res.status(502).json({ error: message });
  } finally {
    res.off("close", onClientGone);
    req.off("aborted", onClientGone);
  }
}

// POST /api/form/fill
// body: { pageHtml: string, profile: string, meta?: object }
// response: NDJSON lines {type:"start"|"delta"|"done"|"error"}
export async function fillWithOpenAI(req, res) {
  await handleFill(req, res, fillFormFieldsOpenAI, "openai");
}

// POST /api/form/fill/cursor
// Same body/response as /fill, using the Cursor API key instead of OpenAI.
// This is the endpoint the job-bot browser extension actually calls.
export async function fillWithCursor(req, res) {
  await handleFill(req, res, fillFormFieldsCursor, "cursor");
}
