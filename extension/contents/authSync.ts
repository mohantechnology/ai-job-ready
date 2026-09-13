import type { PlasmoCSConfig } from "plasmo"

import {
  isWebOrigin,
  parseWebUser,
  WEB_TOKEN_KEY,
  WEB_USER_KEY
} from "~lib/auth"
import { isExtensionContextValid } from "~lib/messaging"

// Runs only to copy the website JWT into the extension. Early-returns on
// every other origin so job-application pages are unaffected.
export const config: PlasmoCSConfig = {
  matches: [
    "http://localhost:6101/*",
    "http://127.0.0.1:6101/*",
    "https://ai-interview.myselfproject.org/*",
    "https://ai_interview.myselfproject.org/*"
  ],
  run_at: "document_idle"
}

let lastSyncedToken: string | null | undefined

function readWebAuth(): { token: string | null; user: ReturnType<typeof parseWebUser> } {
  const token = window.localStorage.getItem(WEB_TOKEN_KEY)
  const user = parseWebUser(window.localStorage.getItem(WEB_USER_KEY))
  return { token: token && token.trim() ? token : null, user }
}

function syncToBackground(): void {
  if (!isExtensionContextValid()) return
  if (!isWebOrigin(window.location.origin)) return

  const { token, user } = readWebAuth()
  if (token === lastSyncedToken) return
  lastSyncedToken = token

  chrome.runtime.sendMessage({ type: "AUTH_SYNC", token, user }).catch(() => {})
}

function onAuthChanged(): void {
  lastSyncedToken = undefined
  syncToBackground()
}

if (isWebOrigin(window.location.origin)) {
  syncToBackground()
  window.addEventListener("jobready:auth-changed", onAuthChanged)
  window.addEventListener("storage", onAuthChanged)
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    const data = event.data as { source?: string; type?: string } | null
    if (data?.source !== "jobready" || data?.type !== "auth-changed") return
    onAuthChanged()
  })
  setInterval(syncToBackground, 1500)
}
