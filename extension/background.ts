import {
  clearAuthState,
  getLoginUrl,
  readAuthState,
  writeAuthState,
  type AuthUser
} from "~lib/auth"
import type {
  AuthStateResult,
  BackendFillRequest,
  BackendFillResponse,
  ExtensionMessage,
  FillFieldsMessage,
  FillStreamMessage,
  FillStreamTiming,
  PageMeta,
  RequestFillResult,
  SaveAnswerResult,
  SaveJobResult,
  UserDetailField
} from "~lib/messaging"
import { FILL_REQUEST_TIMEOUT_MS, LAST_FILL_RESULT_KEY } from "~lib/messaging"
import { getApiBaseUrl } from "~lib/settings"
import { extractCompleteAnswers, extractStreamingTarget, streamTargetKey } from "~lib/streamFill"

// Only the background worker ever calls the backend - content scripts and
// the popup only ever talk to it via chrome.runtime messaging. The JWT
// copied from the website is attached here as Authorization: Bearer.
// The URL itself is resolved fresh (via `getApiBaseUrl()`) on every call
// below instead of read once at module load, so a backend URL the user
// edits in the popup takes effect on the very next request.

// Just under the panel's wait budget so an abort still has time to report
// an error before the UI timeout. Do not abort earlier than this.
const FILL_FETCH_TIMEOUT_MS = FILL_REQUEST_TIMEOUT_MS - 20_000

type TabFieldData = {
  pageHtml: string
  meta: PageMeta
}

// Keyed by tabId, holds the most recent fields/context a content script reported.
const latestFieldsByTab = new Map<number, TabFieldData>()

async function getStoredProfile(): Promise<string> {
  const result = await chrome.storage.local.get("profile")
  return typeof result.profile === "string" ? result.profile : ""
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false
  const user = value as AuthUser
  return typeof user.id === "string" && typeof user.name === "string" && typeof user.email === "string"
}

async function getAuthHeaders(): Promise<{ token: string; headers: Record<string, string> } | null> {
  const auth = await readAuthState()
  if (!auth.token) return null
  return {
    token: auth.token,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`
    }
  }
}

async function handleUnauthorized(): Promise<void> {
  await clearAuthState()
}

async function handleAuthSync(token: string | null, user?: AuthUser | null): Promise<void> {
  if (!token) {
    await clearAuthState()
    return
  }

  let nextUser = isAuthUser(user) ? user : null
  try {
    const apiBaseUrl = await getApiBaseUrl()
    const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (response.status === 401) {
      await clearAuthState()
      return
    }
    if (response.ok) {
      const data = await response.json()
      if (isAuthUser(data?.user)) nextUser = data.user
    }
  } catch {
    // Backend unreachable - still persist the website token so fill can retry.
  }

  await writeAuthState(token, nextUser)
}

async function handleGetAuth(): Promise<AuthStateResult> {
  const auth = await readAuthState()
  return { loggedIn: auth.loggedIn, user: auth.user }
}

async function handleLogout(): Promise<{ ok: true }> {
  await clearAuthState()
  return { ok: true }
}

async function handleOpenLogin(): Promise<{ ok: true }> {
  await chrome.tabs.create({ url: getLoginUrl() })
  return { ok: true }
}

function relayFillStream(tabId: number, message: FillStreamMessage): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {})
}

async function consumeFillNdjson(
  response: Response,
  tabId: number
): Promise<BackendFillResponse["answers"]> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Backend stream has no body")
  }

  const decoder = new TextDecoder()
  let buffer = ""
  let rawJson = ""
  let emitted = 0
  let lastTargetKey = ""
  let finalAnswers: BackendFillResponse["answers"] = []

  const handleEvent = (event: Record<string, unknown>) => {
    const type = event.type
    if (type === "start") {
      // Background already sent start before the fetch so the page can
      // reset. Relaying this one would clear applied fields mid-stream.
      return
    }
    if (type === "delta" && typeof event.text === "string") {
      rawJson += event.text
      relayFillStream(tabId, {
        type: "FILL_STREAM",
        event: "delta",
        text: event.text,
        elapsedMs: typeof event.elapsedMs === "number" ? event.elapsedMs : undefined
      })
      const complete = extractCompleteAnswers(rawJson)
      if (complete.length > emitted) {
        const next = complete.slice(emitted)
        emitted = complete.length
        relayFillStream(tabId, { type: "FILL_STREAM", event: "answers", answers: next })
      }
      const target = extractStreamingTarget(rawJson)
      const targetKey = streamTargetKey(target)
      if (target && targetKey && targetKey !== lastTargetKey) {
        lastTargetKey = targetKey
        relayFillStream(tabId, {
          type: "FILL_STREAM",
          event: "target",
          ...(target.id ? { id: target.id } : {}),
          ...(target.givenId ? { givenId: target.givenId } : {})
        })
      }
      return
    }
    if (type === "done") {
      const answers = Array.isArray(event.answers) ? event.answers : []
      finalAnswers = answers
      if (answers.length > emitted) {
        relayFillStream(tabId, {
          type: "FILL_STREAM",
          event: "answers",
          answers: answers.slice(emitted)
        })
        emitted = answers.length
      }
      relayFillStream(tabId, {
        type: "FILL_STREAM",
        event: "done",
        answers,
        timing:
          event.timing && typeof event.timing === "object"
            ? (event.timing as FillStreamTiming)
            : undefined
      })
      return
    }
    if (type === "error") {
      const error = typeof event.error === "string" ? event.error : "Fill stream failed"
      relayFillStream(tabId, { type: "FILL_STREAM", event: "error", error })
      throw new Error(error)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      handleEvent(JSON.parse(trimmed) as Record<string, unknown>)
    }
  }

  const leftover = (buffer + decoder.decode()).trim()
  if (leftover) {
    handleEvent(JSON.parse(leftover) as Record<string, unknown>)
  }

  return finalAnswers
}

async function requestFillFromBackend(
  pageHtml: string,
  profile: string,
  meta: PageMeta,
  tabId: number
): Promise<BackendFillResponse["answers"]> {
  const body: BackendFillRequest = { pageHtml, profile, meta, stream: true }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FILL_FETCH_TIMEOUT_MS)

  const auth = await getAuthHeaders()
  if (!auth) {
    throw new Error("Sign in to JobReady to fill applications.")
  }

  try {
    const apiBaseUrl = await getApiBaseUrl()
    const response = await fetch(`${apiBaseUrl}/api/form/fill/cursor`, {
      method: "POST",
      headers: auth.headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (response.status === 401) {
      await handleUnauthorized()
      throw new Error("Your session expired. Sign in again to continue.")
    }

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`)
    }

    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("ndjson") || contentType.includes("jsonl")) {
      return await consumeFillNdjson(response, tabId)
    }

    const data: BackendFillResponse = await response.json()
    return data.answers
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The backend took too long to respond. Please try again.")
    }
    if (err instanceof SyntaxError) {
      throw new Error("Backend returned an invalid fill stream")
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function startKeepAlive(): () => void {
  // MV3 service workers can still get killed during a long fetch even with
  // an open message channel. Pinging a chrome API every 20s keeps this
  // worker alive until sendResponse fires (or the fetch timeout hits).
  const id = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {})
  }, 20000)
  return () => clearInterval(id)
}

async function persistFillResult(tabId: number, result: RequestFillResult): Promise<void> {
  try {
    await chrome.storage.local.set({
      [LAST_FILL_RESULT_KEY]: { tabId, result, ts: Date.now() }
    })
  } catch (err) {
    console.warn("[job-bot] failed to persist fill result:", err)
  }
}

// Always returns a result (never throws, never leaves the caller hanging) -
// this is what the popup/panel await to show an accurate final status
// instead of getting stuck on "Filling...".
async function handleRequestFill(
  tabId: number | undefined
): Promise<RequestFillResult> {
  const stopKeepAlive = startKeepAlive()
  try {
    if (tabId === undefined) {
      const result = { ok: false, error: "No active tab found." }
      return result
    }

    const tabData = latestFieldsByTab.get(tabId)
    if (!tabData || !tabData.pageHtml) {
      const result = {
        ok: false,
        error: "No fillable fields detected on this page yet. Try reloading the page."
      }
      await persistFillResult(tabId, result)
      return result
    }

    const auth = await readAuthState()
    if (!auth.loggedIn) {
      const result = {
        ok: false,
        error: "Sign in to JobReady to fill applications."
      }
      await persistFillResult(tabId, result)
      return result
    }

    const profile = await getStoredProfile()

    try {
      relayFillStream(tabId, { type: "FILL_STREAM", event: "start", provider: "cursor" })
      const answers = await requestFillFromBackend(
        tabData.pageHtml,
        profile,
        tabData.meta,
        tabId
      )
      if (!Array.isArray(answers) || answers.length === 0) {
        const result = {
          ok: false,
          error: "Backend returned no answers to fill."
        }
        await persistFillResult(tabId, result)
        return result
      }

      // Best-effort relay for the detect content script / popup-triggered fills.
      // The on-page panel also applies `answers` itself from this result, so a
      // failed/orphaned detect listener can't leave the form blank after a
      // successful backend call.
      const fillMessage: FillFieldsMessage = { type: "FILL_FIELDS", answers }
      try {
        await chrome.tabs.sendMessage(tabId, fillMessage)
      } catch (err) {
        console.warn("[job-bot] FILL_FIELDS relay failed (panel may still apply):", err)
      }

      const result = { ok: true, answers }
      await persistFillResult(tabId, result)
      return result
    } catch (err) {
      console.error("[job-bot] failed to fill form:", err)
      const result = {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error while filling the form."
      }
      await persistFillResult(tabId, result)
      return result
    }
  } finally {
    stopKeepAlive()
  }
}

// Always returns a result (never throws) - the content script's save prompt
// only shows fire-and-forget feedback via console today, but this keeps the
// same never-hang contract as `handleRequestFill` in case a UI is added later.
async function handleSaveAnswer(label: string, value: string): Promise<SaveAnswerResult> {
  return handleSaveDetails([
    { label, key: keyFromLabel(label), answer: [{ value }] }
  ])
}

function keyFromLabel(label: string): string {
  const words = String(label || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
  if (words.length === 0) return "field"
  return words
    .map((word, index) => {
      const lower = word.toLowerCase()
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join("")
}

async function handleSaveJob(pageHtml: string, meta: PageMeta): Promise<SaveJobResult> {
  const stopKeepAlive = startKeepAlive()
  try {
    if (typeof pageHtml !== "string" || pageHtml.trim().length < 40) {
      return { ok: false, error: "This page does not have enough content to save." }
    }

    const auth = await getAuthHeaders()
    if (!auth) {
      return { ok: false, error: "Sign in to JobReady to save jobs." }
    }

    const apiBaseUrl = await getApiBaseUrl()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FILL_FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(`${apiBaseUrl}/api/applied-jobs`, {
        method: "POST",
        headers: auth.headers,
        body: JSON.stringify({ pageHtml, meta }),
        signal: controller.signal
      })
      if (response.status === 401) {
        await handleUnauthorized()
        return { ok: false, error: "Your session expired. Sign in again to continue." }
      }
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          (typeof data?.error === "string" ? data.error : data?.error?.message) ||
          `Backend responded with ${response.status}`
        return { ok: false, error: message }
      }
      return {
        ok: true,
        created: Boolean(data?.created),
        role: typeof data?.job?.role === "string" ? data.job.role : undefined,
        company: typeof data?.job?.company === "string" ? data.job.company : undefined
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: "Saving this job took too long. Please try again." }
      }
      console.error("[job-bot] failed to save job:", err)
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error while saving this job."
      }
    } finally {
      clearTimeout(timer)
    }
  } finally {
    stopKeepAlive()
  }
}

async function handleSaveDetails(fields: UserDetailField[]): Promise<SaveAnswerResult> {
  try {
    const auth = await getAuthHeaders()
    if (!auth) {
      return { ok: false, error: "Sign in to JobReady to save answers." }
    }

    const apiBaseUrl = await getApiBaseUrl()
    const response = await fetch(`${apiBaseUrl}/api/user/save-details`, {
      method: "POST",
      headers: auth.headers,
      body: JSON.stringify({ fields })
    })
    if (response.status === 401) {
      await handleUnauthorized()
      return { ok: false, error: "Your session expired. Sign in again to continue." }
    }
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`)
    }
    return { ok: true }
  } catch (err) {
    console.error("[job-bot] failed to save details:", err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error while saving details."
    }
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    if (message.type === "FIELDS_DETECTED" && sender.tab?.id !== undefined) {
      latestFieldsByTab.set(sender.tab.id, {
        pageHtml: message.pageHtml,
        meta: message.meta || { url: "", title: "" }
      })
      return
    }

    // REQUEST_FILL: prefer `sender.tab` when the on-page panel (a content
    // script) is the caller - service workers have no reliable "current
    // window", so `currentWindow: true` can resolve the wrong tab. Popup
    // callers have no sender.tab, so fall back to the last-focused window's
    // active tab. Returning `true` keeps the message channel open until
    // sendResponse below fires.
    if (message.type === "REQUEST_FILL") {
      if (sender.tab?.id !== undefined) {
        handleRequestFill(sender.tab.id).then(sendResponse)
        return true
      }

      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        handleRequestFill(tabs[0]?.id).then(sendResponse)
      })
      return true
    }

    if (message.type === "SAVE_ANSWER") {
      handleSaveAnswer(message.label, message.value).then(sendResponse)
      return true
    }

    if (message.type === "SAVE_DETAILS") {
      handleSaveDetails(message.fields).then(sendResponse)
      return true
    }

    if (message.type === "SAVE_JOB") {
      handleSaveJob(message.pageHtml, message.meta).then(sendResponse)
      return true
    }

    if (message.type === "AUTH_SYNC") {
      handleAuthSync(message.token, message.user).then(() => sendResponse({ ok: true }))
      return true
    }

    if (message.type === "GET_AUTH") {
      handleGetAuth().then(sendResponse)
      return true
    }

    if (message.type === "LOGOUT") {
      handleLogout().then(sendResponse)
      return true
    }

    if (message.type === "OPEN_LOGIN") {
      handleOpenLogin().then(sendResponse)
      return true
    }
  }
)
