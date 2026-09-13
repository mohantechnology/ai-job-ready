import type { PlasmoCSConfig } from "plasmo"

import { getAdapterForHostname } from "~adapters"
import type { ExtensionMessage, FieldsDetectedMessage, PageMeta } from "~lib/messaging"
import { isExtensionContextValid } from "~lib/messaging"
import { logFillStream } from "~lib/streamFill"

// Broad matches for now (task.txt's "learn each website's filters" work is
// what will let us narrow this down per adapter later). No host_permissions
// are requested up front, so this only runs where the user has granted
// activeTab access for that tab.
export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  run_at: "document_idle"
}

const adapter = getAdapterForHostname(window.location.hostname)

// Safety cap so a pathological page can't freeze messaging. The backend
// still parses/strips this down further before it hits OpenAI.
const MAX_PAGE_HTML_CHARS = 5_000_000

function metaContent(selector: string): string | undefined {
  const content = document.querySelector(selector)?.getAttribute("content")?.trim()
  return content || undefined
}

function extractPageMeta(): PageMeta {
  const description = metaContent('meta[name="description"]')
  const ogTitle = metaContent('meta[property="og:title"]')
  const ogSiteName = metaContent('meta[property="og:site_name"]')
  const ogDescription = metaContent('meta[property="og:description"]')
  const heading = document.querySelector("h1")?.textContent?.trim()

  return {
    url: window.location.href,
    title: document.title?.trim() || "",
    ...(description ? { description } : {}),
    ...(ogTitle ? { ogTitle } : {}),
    ...(ogSiteName ? { ogSiteName } : {}),
    ...(ogDescription ? { ogDescription } : {}),
    ...(heading ? { heading } : {})
  }
}

function extractPageHtml(): string {
  const html = document.documentElement?.outerHTML || document.body?.outerHTML || ""
  return html.length > MAX_PAGE_HTML_CHARS ? html.slice(0, MAX_PAGE_HTML_CHARS) : html
}

// Job application forms are frequently SPA-rendered, so the fields we care
// about often don't exist yet at document_idle - re-scan on DOM changes,
// debounced so we don't spam the background worker on every keystroke.
let debounceTimer: ReturnType<typeof setTimeout> | undefined
const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(reportDetectedFields, 500)
})

// Once the extension that injected this content script has been
// reloaded/updated (very common in `pnpm dev`), this script is orphaned -
// `chrome.runtime.id` disappears and every further `sendMessage` call would
// throw "Extension context invalidated" (uncaught, since it's a plain
// content-script call with no listener to reject a promise for). Stop
// re-scanning entirely instead of erroring on every DOM mutation until the
// page itself is reloaded.
function stopWatchingPage() {
  observer.disconnect()
  if (debounceTimer) clearTimeout(debounceTimer)
}

function reportDetectedFields() {
  if (!isExtensionContextValid()) {
    stopWatchingPage()
    return
  }

  // Tags every fillable element with a durable id/marker attribute *before*
  // the HTML is captured below, so the LLM reads the exact same identifiers
  // `fillFields` will later resolve against.
  const fieldCount = adapter.tagFillableFields()
  if (fieldCount === 0) return

  const message: FieldsDetectedMessage = {
    type: "FIELDS_DETECTED",
    pageHtml: extractPageHtml(),
    meta: extractPageMeta()
  }

  try {
    // This is a best-effort background report (not a user-triggered action
    // awaiting a result), so a rejected/orphaned background worker is safe
    // to swallow rather than surface anywhere.
    chrome.runtime.sendMessage(message)?.catch(() => stopWatchingPage())
  } catch {
    stopWatchingPage()
  }
}

observer.observe(document.documentElement, { childList: true, subtree: true })

reportDetectedFields()

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === "FILL_STREAM") {
    logFillStream(message)
    if (message.event === "start") {
      adapter.beginFillSession?.()
      return
    }
    if (message.event === "target") {
      adapter.highlightTarget?.({ id: message.id, givenId: message.givenId })
      return
    }
    if (message.event === "answers" || message.event === "done") {
      if (Array.isArray(message.answers) && message.answers.length > 0) {
        adapter.fillFields(message.answers)
      }
    }
    if (message.event === "done" || message.event === "error") {
      adapter.highlightTarget?.({})
    }
    return
  }
  if (message.type === "FILL_FIELDS") {
    adapter.fillFields(message.answers)
  }
})
