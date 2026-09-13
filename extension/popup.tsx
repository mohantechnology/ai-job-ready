import { useEffect, useRef, useState } from "react"

import { AUTH_USER_KEY, ACCESS_TOKEN_KEY, type AuthUser } from "~lib/auth"
import { sendMessageWithTimeout } from "~lib/messaging"
import {
  API_BASE_URL_KEY,
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  resetApiBaseUrl,
  setApiBaseUrl
} from "~lib/settings"

/** Global styles for things inline `style` objects can't express (hover, focus, keyframes). */
const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  .jr-popup {
    width: 320px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1e1b3a;
    background: #ffffff;
  }
  .jr-header {
    padding: 18px 18px 16px;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: #fff;
  }
  .jr-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .jr-brand-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.22);
    font-size: 13px;
  }
  .jr-tagline {
    margin: 6px 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.85);
  }
  .jr-body {
    padding: 16px 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .jr-card {
    background: #f7f7fd;
    border: 1px solid #ececf9;
    border-radius: 12px;
    padding: 12px;
  }
  .jr-account-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .jr-avatar {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 700;
  }
  .jr-account-info { min-width: 0; flex: 1; }
  .jr-account-name {
    font-size: 13.5px;
    font-weight: 700;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .jr-account-email {
    font-size: 11.5px;
    color: #6b6b85;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .jr-section-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #8a8aa3;
    margin-bottom: 8px;
  }
  .jr-url-display {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .jr-url-pill {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
    color: #3730a3;
    background: #ffffff;
    border: 1px solid #e0e0f2;
    border-radius: 7px;
    padding: 6px 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .jr-icon-btn {
    flex-shrink: 0;
    border: 1px solid #e0e0f2;
    background: #ffffff;
    border-radius: 7px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #6366f1;
    font-size: 13px;
    transition: background 0.12s ease, transform 0.08s ease;
  }
  .jr-icon-btn:hover { background: #eef0ff; }
  .jr-icon-btn:active { transform: scale(0.94); }
  .jr-input {
    width: 100%;
    font-size: 12.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    padding: 7px 9px;
    border-radius: 7px;
    border: 1.5px solid #6366f1;
    outline: none;
    background: #fff;
    color: #1e1b3a;
  }
  .jr-input.jr-input-error { border-color: #dc2626; }
  .jr-btn-row { display: flex; gap: 8px; margin-top: 8px; }
  .jr-btn {
    border: none;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.12s ease, transform 0.08s ease;
  }
  .jr-btn:active { transform: scale(0.97); }
  .jr-btn:disabled { cursor: default; opacity: 0.6; }
  .jr-btn-primary {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    width: 100%;
    padding: 11px 12px;
    font-size: 13.5px;
    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
  }
  .jr-btn-primary:hover:not(:disabled) { filter: brightness(1.06); }
  .jr-btn-secondary {
    background: #eef0ff;
    color: #4338ca;
    flex: 1;
  }
  .jr-btn-secondary:hover:not(:disabled) { background: #e0e3ff; }
  .jr-btn-ghost {
    background: transparent;
    color: #8a8aa3;
    flex: 1;
    border: 1px solid #e0e0f2;
  }
  .jr-btn-ghost:hover:not(:disabled) { background: #f7f7fd; }
  .jr-btn-outline {
    background: #fff;
    color: #4338ca;
    border: 1.5px solid #d9d9f5;
    width: 100%;
  }
  .jr-btn-outline:hover:not(:disabled) { background: #f7f7fd; }
  .jr-logout {
    flex-shrink: 0;
    border: 1px solid #e0e0f2;
    background: #ffffff;
    color: #6b6b85;
    border-radius: 7px;
    padding: 6px 10px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .jr-logout:hover:not(:disabled) { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
  .jr-hint {
    margin: 0;
    font-size: 11.5px;
    color: #8a8aa3;
    line-height: 1.5;
  }
  .jr-spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    animation: jr-spin 0.7s linear infinite;
    display: inline-block;
  }
  @keyframes jr-spin { to { transform: rotate(360deg); } }
  .jr-loading-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #c7c7f0;
    animation: jr-pulse 1s ease-in-out infinite;
  }
  @keyframes jr-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
`

function initialFor(user: AuthUser | null): string {
  const source = user?.name?.trim() || user?.email?.trim() || "?"
  return source.charAt(0).toUpperCase()
}

function IndexPopup() {
  const [authReady, setAuthReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Backend URL (editable, persisted, picked up by the background worker
  // on its next request - see ~lib/settings).
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_BASE_URL)
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [urlError, setUrlError] = useState("")
  const [urlSaved, setUrlSaved] = useState(false)
  const [showBackendPanel, setShowBackendPanel] = useState(false)
  const urlInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function loadAuth() {
      const result = await chrome.storage.local.get([ACCESS_TOKEN_KEY, AUTH_USER_KEY])
      const token = typeof result[ACCESS_TOKEN_KEY] === "string" ? result[ACCESS_TOKEN_KEY] : ""
      const nextUser = result[AUTH_USER_KEY] as AuthUser | null
      setLoggedIn(Boolean(token))
      setUser(nextUser && typeof nextUser.email === "string" ? nextUser : null)
      setAuthReady(true)
      // Once the website tab finishes login and syncs the token in, drop
      // the "Opening sign in..." state so the popup flips over on its own.
      setSigningIn(false)
    }

    async function loadApiUrl() {
      setApiUrl(await getApiBaseUrl())
    }

    loadAuth()
    loadApiUrl()

    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== "local") return
      if (changes[ACCESS_TOKEN_KEY] || changes[AUTH_USER_KEY]) {
        loadAuth()
      }
      if (changes[API_BASE_URL_KEY]) {
        loadApiUrl()
      }
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  useEffect(() => {
    if (editingUrl) urlInputRef.current?.focus()
  }, [editingUrl])

  async function handleSignIn() {
    setSigningIn(true)
    try {
      await sendMessageWithTimeout({ type: "OPEN_LOGIN" }, 5000)
    } finally {
      // Leave `signingIn` true - it clears itself once loadAuth sees a
      // token appear (see the onChanged listener above). If the user
      // closes the tab without signing in, re-clicking Sign in resets it.
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await sendMessageWithTimeout({ type: "LOGOUT" }, 5000)
    } finally {
      setLoggedIn(false)
      setUser(null)
      setLoggingOut(false)
    }
  }

  function handleStartEditUrl() {
    setUrlInput(apiUrl)
    setUrlError("")
    setEditingUrl(true)
  }

  function handleCancelEditUrl() {
    setEditingUrl(false)
    setUrlError("")
  }

  async function handleSaveUrl() {
    try {
      const normalized = await setApiBaseUrl(urlInput)
      setApiUrl(normalized)
      setEditingUrl(false)
      setUrlError("")
      setUrlSaved(true)
      setTimeout(() => setUrlSaved(false), 1800)
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Invalid URL.")
    }
  }

  async function handleResetUrl() {
    const restored = await resetApiBaseUrl()
    setApiUrl(restored)
    setUrlInput(restored)
    setUrlError("")
  }

  function handleUrlKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSaveUrl()
    if (e.key === "Escape") handleCancelEditUrl()
  }

  const backendSection = (
    <div className="jr-card">
      <div className="jr-section-label">
        <span>Backend server</span>
        {urlSaved && <span style={{ color: "#16a34a", fontWeight: 700 }}>Saved ✓</span>}
      </div>
      {editingUrl ? (
        <>
          <input
            ref={urlInputRef}
            className={`jr-input${urlError ? " jr-input-error" : ""}`}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            placeholder="https://api.example.com"
            spellCheck={false}
          />
          {urlError && (
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#dc2626" }}>{urlError}</p>
          )}
          <div className="jr-btn-row">
            <button className="jr-btn jr-btn-secondary" onClick={handleSaveUrl}>
              Save
            </button>
            <button className="jr-btn jr-btn-ghost" onClick={handleCancelEditUrl}>
              Cancel
            </button>
          </div>
          {apiUrl !== DEFAULT_API_BASE_URL && (
            <button
              className="jr-btn jr-btn-ghost"
              style={{ width: "100%", marginTop: 8 }}
              onClick={handleResetUrl}>
              Reset to default ({DEFAULT_API_BASE_URL})
            </button>
          )}
        </>
      ) : (
        <div className="jr-url-display">
          <span className="jr-url-pill" title={apiUrl}>
            {apiUrl}
          </span>
          <button
            className="jr-icon-btn"
            onClick={handleStartEditUrl}
            title="Edit backend URL"
            aria-label="Edit backend URL">
            ✎
          </button>
        </div>
      )}
    </div>
  )

  if (!authReady) {
    return (
      <div className="jr-popup">
        <style>{GLOBAL_CSS}</style>
        <div className="jr-header">
          <div className="jr-brand">
            <span className="jr-brand-badge">⚡</span>
            <span>JobReady Form Filler</span>
          </div>
        </div>
        <div className="jr-body">
          <div style={{ display: "flex", gap: 5, padding: "10px 2px" }}>
            <span className="jr-loading-dot" />
            <span className="jr-loading-dot" style={{ animationDelay: "0.15s" }} />
            <span className="jr-loading-dot" style={{ animationDelay: "0.3s" }} />
          </div>
        </div>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <div className="jr-popup">
        <style>{GLOBAL_CSS}</style>
        <div className="jr-header">
          <div className="jr-brand">
            <span className="jr-brand-badge">⚡</span>
            <span>JobReady Form Filler</span>
          </div>
          <p className="jr-tagline">Autofill job applications from your saved profile.</p>
        </div>
        <div className="jr-body">
          <div className="jr-card" style={{ textAlign: "center", padding: "18px 14px" }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#4b4b63", lineHeight: 1.5 }}>
              Sign in with your JobReady account to get started.
            </p>
            <button className="jr-btn jr-btn-primary" onClick={handleSignIn} disabled={signingIn}>
              {signingIn ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <span
                    className="jr-spinner"
                    style={{ borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
                  />
                  Opening sign in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
            {signingIn && (
              <p className="jr-hint" style={{ marginTop: 10 }}>
                Finish signing in (or signing up) in the tab that just opened. This popup
                updates automatically.
              </p>
            )}
          </div>

          <button className="jr-btn jr-btn-outline" onClick={() => setShowBackendPanel((v) => !v)}>
            {showBackendPanel ? "Hide backend settings" : "⚙ Backend settings"}
          </button>
          {showBackendPanel && backendSection}
        </div>
      </div>
    )
  }

  return (
    <div className="jr-popup">
      <style>{GLOBAL_CSS}</style>
      <div className="jr-header">
        <div className="jr-brand">
          <span className="jr-brand-badge">⚡</span>
          <span>JobReady Form Filler</span>
        </div>
      </div>
      <div className="jr-body">
        <div className="jr-card">
          <div className="jr-account-row">
            <div className="jr-avatar">{initialFor(user)}</div>
            <div className="jr-account-info">
              <div className="jr-account-name" title={user?.name || user?.email || ""}>
                {user?.name || "Signed in"}
              </div>
              <div className="jr-account-email" title={user?.email || ""}>
                {user?.email || "Unknown email"}
              </div>
            </div>
            <button className="jr-logout" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? "..." : "Log out"}
            </button>
          </div>
        </div>

        {backendSection}

        <p className="jr-hint" style={{ textAlign: "center" }}>
          Open the ⚡ button on a job application page to autofill it.
        </p>
      </div>
    </div>
  )
}

export default IndexPopup
