/**
 * Auth helpers shared by the popup, on-page panel, website sync content
 * script, and background worker. The website login stores a JWT in
 * localStorage; the extension copies it into chrome.storage.local and
 * sends it as `Authorization: Bearer` on every backend call.
 */

export const ACCESS_TOKEN_KEY = "jobbot:accessToken"
export const AUTH_USER_KEY = "jobbot:user"

export const WEB_TOKEN_KEY = "voicebot_token"
export const WEB_USER_KEY = "voicebot_user"

export type AuthUser = {
  id: string
  name: string
  email: string
}

export type AuthState = {
  loggedIn: boolean
  token: string | null
  user: AuthUser | null
}

export function getWebBaseUrl(): string {
  const raw = process.env.PLASMO_PUBLIC_WEB_URL || "http://localhost:6101"
  const first = raw.split(",")[0]?.trim() || "http://localhost:6101"
  return first.replace(/\/$/, "")
}

export function getLoginUrl(): string {
  return `${getWebBaseUrl()}/login?from=extension`
}

export function webOrigins(): Set<string> {
  const raw = process.env.PLASMO_PUBLIC_WEB_URL || "http://localhost:6101"
  const origins = new Set<string>()
  for (const part of raw.split(",")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    try {
      origins.add(new URL(trimmed).origin)
    } catch {
      // skip invalid entries
    }
  }
  if (origins.has("http://localhost:6101")) {
    origins.add("http://127.0.0.1:6101")
  }
  if (origins.has("http://127.0.0.1:6101")) {
    origins.add("http://localhost:6101")
  }
  return origins
}

export function isWebOrigin(origin: string): boolean {
  return webOrigins().has(origin)
}

export async function readAuthState(): Promise<AuthState> {
  const result = await chrome.storage.local.get([ACCESS_TOKEN_KEY, AUTH_USER_KEY])
  const token = typeof result[ACCESS_TOKEN_KEY] === "string" ? result[ACCESS_TOKEN_KEY] : null
  const user = isAuthUser(result[AUTH_USER_KEY]) ? result[AUTH_USER_KEY] : null
  return { loggedIn: Boolean(token), token, user }
}

export async function writeAuthState(token: string, user: AuthUser | null): Promise<void> {
  await chrome.storage.local.set({
    [ACCESS_TOKEN_KEY]: token,
    [AUTH_USER_KEY]: user
  })
}

export async function clearAuthState(): Promise<void> {
  await chrome.storage.local.remove([ACCESS_TOKEN_KEY, AUTH_USER_KEY])
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false
  const user = value as AuthUser
  return typeof user.id === "string" && typeof user.name === "string" && typeof user.email === "string"
}

export function parseWebUser(raw: string | null): AuthUser | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return isAuthUser(parsed) ? parsed : null
  } catch {
    return null
  }
}
