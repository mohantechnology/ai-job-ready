/**
 * Typed message contracts shared between content scripts, the popup/options
 * UI, and the background service worker. Keeping these in one place is what
 * lets every other layer stay browser-agnostic and swap transports later.
 */

export type FieldAction = "type" | "select" | "check" | "uncheck" | "skip"

/**
 * The LLM's own classification of an element's real tag/type, read straight
 * from the HTML. Radio inputs sharing the same `name` attribute are
 * collapsed into one `"radio-group"` entry instead of being reported
 * individually.
 */
export type FieldKind = "text" | "textarea" | "select" | "checkbox" | "radio-group"

/**
 * One option the LLM saw on a `select` or `radio-group`. For a `select`
 * this is just context for why it picked `value`; for a `radio-group` this
 * IS the resolvable target - `id`/`givenId` identify that specific radio
 * input, since the group itself has no single DOM element.
 */
export type FieldOption = {
  /** The specific radio input's native `id`, if it had one (`radio-group` only). */
  id?: string
  /** The specific radio input's injected `data-jobbot-id` marker (`radio-group` only). */
  givenId?: string
  label: string
  value: string
}

/** The LLM's actual answer for a field: how sure it is, what to fill, and whether it was a guess. */
export type FieldAnswerDetail = {
  /** How confident the LLM is in this answer, 0-10. */
  confidence: number
  /** Text to type ("type"), or the chosen option's value/text ("select"/"radio-group"). Unused for check/uncheck/skip. */
  value?: string
  /** True if the LLM had to guess (no direct match in the candidate profile) rather than answer from a known fact. */
  guessed: boolean
}

/**
 * The LLM reads the page HTML itself (annotated with a durable
 * `data-jobbot-id` attribute on any element that lacked a native `id`) and
 * answers per concrete field instead of a pre-classified field record -
 * `id`/`givenId` is how the extension resolves the field back to the exact
 * DOM element, `action` is what to do with it based on the element's real
 * tag/type. `label`/`kind`/`required`/`options` are the LLM's own read of
 * that field (useful for the "save for later" prompt and for debugging bad
 * answers), and `answer` (always a one-item array) carries the actual
 * value/confidence/guessed verdict.
 *
 * For `kind: "radio-group"`, `id`/`givenId` are omitted (the group has no
 * single element) - the extension instead resolves the option named by
 * `answer[0].value` inside `options[]` to its own `id`/`givenId`.
 */
export type FieldAnswer = {
  /** The element's native `id` attribute, if it had one. Omitted for `kind: "radio-group"`. */
  id?: string
  /** The injected `data-jobbot-id` marker, for elements that had no native `id`. Omitted for `kind: "radio-group"`. */
  givenId?: string
  /** The exact question/label text the LLM read for this element. */
  label?: string
  /** The LLM's own read of the element's real tag/type. */
  kind?: FieldKind
  action: FieldAction
  required?: boolean
  /** For `kind: "select"` or `"radio-group"`: the real options the LLM saw. */
  options?: FieldOption[]
  /** Always a one-item array holding the LLM's actual answer for this field. */
  answer: FieldAnswerDetail[]
}

/** Page metadata captured alongside the full HTML dump. */
export type PageMeta = {
  url: string
  title: string
  description?: string
  ogTitle?: string
  ogSiteName?: string
  ogDescription?: string
  heading?: string
}

export type JobDetails = {
  title: string
  description: string
  /** Exact URL of this job posting. */
  link: string
}

export type CompanyDetails = {
  name: string
  about: string
  /** Company website / careers page (not the job-board listing). */
  link: string
}

/** Sent by a content script once it has scanned and tagged the page's fillable fields. */
export type FieldsDetectedMessage = {
  type: "FIELDS_DETECTED"
  /** Full page HTML (after `data-jobbot-id` tagging). Backend parses/strips this. */
  pageHtml: string
  /** Page url/title/og tags/heading - not a pre-extracted job blurb. */
  meta: PageMeta
}

/** Sent by the popup/panel to ask the active tab's content script to fill the form. */
export type RequestFillMessage = {
  type: "REQUEST_FILL"
}

/**
 * Reply to `RequestFillMessage`, so the UI can show an accurate final status.
 * (Not a discriminated union on purpose - this project's tsconfig has
 * `strict: false`/`strictNullChecks: false`, under which TS doesn't narrow
 * `{ok:true} | {ok:false; error:string}` reliably.)
 *
 * `answers` is included on success so a content-script UI (the on-page panel)
 * can apply the fill itself - `chrome.tabs.sendMessage(FILL_FIELDS)` alone is
 * not enough when the detect script is orphaned after an extension reload
 * while the panel is still able to talk to the (new) background worker.
 */
export type RequestFillResult = {
  ok: boolean
  error?: string
  answers?: FieldAnswer[]
}

/** Sent by the background worker to a content script with answers to apply. */
export type FillFieldsMessage = {
  type: "FILL_FIELDS"
  answers: FieldAnswer[]
}

export type FillStreamTiming = {
  ttfbMs?: number | null
  totalMs?: number
  setupMs?: number
  chars?: number
}

/**
 * Live NDJSON fill events from the backend, relayed by the background
 * worker so the page can log the stream and fill fields as each answer
 * object closes.
 */
export type FillStreamMessage =
  | { type: "FILL_STREAM"; event: "start"; provider?: string }
  | { type: "FILL_STREAM"; event: "delta"; text: string; elapsedMs?: number }
  | { type: "FILL_STREAM"; event: "target"; id?: string; givenId?: string }
  | { type: "FILL_STREAM"; event: "answers"; answers: FieldAnswer[] }
  | {
      type: "FILL_STREAM"
      event: "done"
      answers: FieldAnswer[]
      timing?: FillStreamTiming
    }
  | { type: "FILL_STREAM"; event: "error"; error: string }

/**
 * Sent by a content script when the user confirms a filled/guessed answer
 * (or manually answers a skipped field). Persisted under `newDetails` as
 * `{ label, key, answer: [{ value }] }` records.
 */
export type UserDetailField = {
  label: string
  key: string
  answer: { value: string }[]
}

export type SaveDetailsMessage = {
  type: "SAVE_DETAILS"
  fields: UserDetailField[]
}

/**
 * Sent by a content script (from the "Save for later use" prompt) when the
 * user manually answers a field the LLM had skipped for lack of data -
 * `label` is the field's own label/question text, not a portal-specific
 * field id, so it generalizes across sites.
 */
export type SaveAnswerMessage = {
  type: "SAVE_ANSWER"
  label: string
  value: string
}

/** Reply to `SaveAnswerMessage` / `SaveDetailsMessage`. */
export type SaveAnswerResult = {
  ok: boolean
  error?: string
}

export type ExtensionMessage =
  | FieldsDetectedMessage
  | RequestFillMessage
  | FillFieldsMessage
  | FillStreamMessage
  | SaveAnswerMessage
  | SaveDetailsMessage

export type BackendFillRequest = {
  pageHtml: string
  profile: string
  meta?: PageMeta
  stream?: boolean
}

export type BackendFillResponse = {
  // job_details / company_details paused for now
  job_details?: JobDetails
  company_details?: CompanyDetails
  answers: FieldAnswer[]
}

/**
 * `chrome.runtime.id` disappears (becomes `undefined`) once the extension
 * that injected the current content script has been reloaded/updated -
 * every `chrome.runtime.*` call in that orphaned script then throws
 * "Extension context invalidated" instead of failing gracefully. This is
 * the standard way to detect that state up front, without triggering the
 * throw itself.
 */
export function isExtensionContextValid(): boolean {
  try {
    return Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

/**
 * `REQUEST_FILL` waits on a real LLM call plus network/queueing. The old
 * 90s budget (and the background's even-shorter 70s fetch abort) cancelled
 * the in-flight request while OpenAI was still working, so a successful
 * backend response never reached the panel. Raised by 3 minutes on top of
 * that 90s so the UI/fetch stay open until the actual timeout, not before.
 */
export const FILL_REQUEST_TIMEOUT_MS = 90_000 + 3 * 60_000

/** chrome.storage.local key the background writes when a fill settles, so the panel can recover if the message port closes mid-wait. */
export const LAST_FILL_RESULT_KEY = "jobbot:lastFillResult"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readFreshFillResult(since: number): Promise<RequestFillResult | null> {
  try {
    const data = await chrome.storage.local.get(LAST_FILL_RESULT_KEY)
    const entry = data[LAST_FILL_RESULT_KEY]
    if (
      entry &&
      typeof entry.ts === "number" &&
      entry.ts >= since &&
      entry.result &&
      typeof entry.result.ok === "boolean"
    ) {
      return entry.result as RequestFillResult
    }
  } catch {
    // storage may be unavailable in an orphaned content script - polling
    // just won't recover, and the timeout below still settles the request.
  }
  return null
}

/**
 * Wait the full fill budget for `REQUEST_FILL`. Does not abort early if the
 * service-worker message port closes - keeps polling stored results until
 * `FILL_REQUEST_TIMEOUT_MS` actually elapses.
 */
export async function requestFillFromBackground(): Promise<RequestFillResult> {
  if (!isExtensionContextValid()) {
    throw new Error("Extension was reloaded - please refresh this page and try again.")
  }

  const t0 = Date.now()
  const deadline = t0 + FILL_REQUEST_TIMEOUT_MS
  let sendError: Error | null = null
  let sendResult: RequestFillResult | undefined

  chrome.runtime
    .sendMessage({ type: "REQUEST_FILL" })
    .then((response: RequestFillResult) => {
      if (response && typeof response.ok === "boolean") {
        sendResult = response
      }
    })
    .catch((err: unknown) => {
      sendError = err instanceof Error ? err : new Error(String(err))
    })

  while (Date.now() < deadline) {
    if (sendResult) return sendResult

    const stored = await readFreshFillResult(t0)
    if (stored) return stored

    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await sleep(Math.min(1000, remaining))
  }

  if (sendResult) return sendResult
  const stored = await readFreshFillResult(t0)
  if (stored) return stored

  throw sendError || new Error("Timed out waiting for a response.")
}

/**
 * `chrome.runtime.sendMessage` can, in edge cases (a suspended/orphaned
 * service worker, an invalidated content-script context after a reload),
 * hang or throw synchronously instead of rejecting - which is how a
 * "Filling..." button gets stuck forever, or an uncaught error shows up in
 * the page console. This wraps it with a hard timeout and a try/catch so
 * callers always settle with a real result instead.
 *
 * For autofill, use `requestFillFromBackground` instead - that one will not
 * cancel before `FILL_REQUEST_TIMEOUT_MS`.
 */
export function sendMessageWithTimeout<T>(
  message: ExtensionMessage,
  timeoutMs = 15000
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!isExtensionContextValid()) {
      reject(new Error("Extension was reloaded - please refresh this page and try again."))
      return
    }

    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for a response."))
    }, timeoutMs)

    try {
      chrome.runtime
        .sendMessage(message)
        .then((response: T) => {
          clearTimeout(timer)
          resolve(response)
        })
        .catch((err: unknown) => {
          clearTimeout(timer)
          reject(err instanceof Error ? err : new Error(String(err)))
        })
    } catch (err) {
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}
