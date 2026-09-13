/**
 * User-editable backend API URL. Ships with a build-time default (from
 * `.env.development` / `.env.production`), but the popup lets a user point
 * the extension at a different backend (e.g. a local server vs. the hosted
 * one) - that override lives in chrome.storage.local so it survives
 * restarts and is picked up by the background worker on its very next
 * request (nothing else needs to be notified/restarted).
 */

export const API_BASE_URL_KEY = "jobbot:apiBaseUrl"

function envDefaultApiBaseUrl(): string {
  const raw = process.env.PLASMO_PUBLIC_API_BASE_URL || "http://localhost:6102"
  try {
    return normalizeBaseUrl(raw)
  } catch {
    return "http://localhost:6102"
  }
}

export const DEFAULT_API_BASE_URL = envDefaultApiBaseUrl()

/** Trims, validates, and strips any trailing slash. Throws a user-facing message on bad input. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = String(raw || "").trim().replace(/\/+$/, "")
  if (!trimmed) {
    throw new Error("Enter a backend URL.")
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error("Enter a full URL, e.g. https://api.example.com")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must start with http:// or https://")
  }
  if (!url.host) {
    throw new Error("Enter a full URL, e.g. https://api.example.com")
  }

  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")
  return `${url.protocol}//${url.host}${path}`
}

export async function getApiBaseUrl(): Promise<string> {
  try {
    const result = await chrome.storage.local.get(API_BASE_URL_KEY)
    const stored = result[API_BASE_URL_KEY]
    if (typeof stored === "string" && stored.trim()) {
      return normalizeBaseUrl(stored)
    }
  } catch {
    // storage unavailable (e.g. orphaned context) - fall back below.
  }
  return DEFAULT_API_BASE_URL
}

/** Validates + persists a new backend URL. Returns the normalized value that was saved. */
export async function setApiBaseUrl(raw: string): Promise<string> {
  const normalized = normalizeBaseUrl(raw)
  await chrome.storage.local.set({ [API_BASE_URL_KEY]: normalized })
  return normalized
}

/** Clears the override so the build-time default takes over again. */
export async function resetApiBaseUrl(): Promise<string> {
  await chrome.storage.local.remove(API_BASE_URL_KEY)
  return DEFAULT_API_BASE_URL
}
