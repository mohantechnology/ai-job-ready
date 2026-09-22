import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"

import type { PlasmoCSConfig } from "plasmo"

import { getAdapterForHostname } from "~adapters"
import { ACCESS_TOKEN_KEY, isWebOrigin } from "~lib/auth"
import type { ExtensionMessage, PageMeta, SaveJobResult } from "~lib/messaging"
import { FILL_REQUEST_TIMEOUT_MS, requestFillFromBackground, sendMessageWithTimeout } from "~lib/messaging"

// Same broad matches as the field-detection content script - this panel is
// the primary way users trigger a fill, so it needs to be present anywhere
// detect.ts is.
export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  run_at: "document_idle"
}

type FillStatus = "idle" | "filling" | "done" | "error"
type SaveStatus = "idle" | "saving" | "done" | "error"

const MAX_PAGE_HTML_CHARS = 2_000_000

function metaContent(selector: string): string | undefined {
  const content = document.querySelector(selector)?.getAttribute("content")?.trim()
  return content || undefined
}

function capturePageMeta(): PageMeta {
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

function capturePageHtml(): string {
  const html = document.documentElement?.outerHTML || document.body?.outerHTML || ""
  return html.length > MAX_PAGE_HTML_CHARS ? html.slice(0, MAX_PAGE_HTML_CHARS) : html
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

const launcherStyle: CSSProperties = {
  position: "fixed",
  bottom: 20,
  right: 20,
  width: 52,
  height: 52,
  borderRadius: "50%",
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  color: "#fff",
  fontSize: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 6px 16px rgba(99, 102, 241, 0.45)",
  zIndex: 2147483647
}

const panelStyle: CSSProperties = {
  position: "fixed",
  bottom: 20,
  right: 20,
  width: 260,
  borderRadius: 14,
  overflow: "hidden",
  background: "#ffffff",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
  fontFamily: FONT_STACK,
  border: "1px solid rgba(0,0,0,0.06)",
  zIndex: 2147483647
}

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  color: "#fff"
}

const closeButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: 4,
  opacity: 0.9
}

const bodyStyle: CSSProperties = {
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8
}

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  background: "#6366f1",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
}

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #e2e2f5",
  borderRadius: 8,
  padding: "10px 12px",
  background: "#f7f7fd",
  color: "#333",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
}

const statusStyle = (color: string): CSSProperties => ({
  margin: 0,
  fontSize: 12,
  color
})

function JobBotPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [status, setStatus] = useState<FillStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [saveMessage, setSaveMessage] = useState("")
  const streamedRef = useRef(false)
  const adapter = getAdapterForHostname(window.location.hostname)
  const onWebsite = isWebOrigin(window.location.origin)

  useEffect(() => {
    async function loadAuth() {
      try {
        const result = await chrome.storage.local.get(ACCESS_TOKEN_KEY)
        setLoggedIn(typeof result[ACCESS_TOKEN_KEY] === "string" && Boolean(result[ACCESS_TOKEN_KEY]))
      } catch {
        setLoggedIn(false)
      }
    }

    loadAuth()
    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== "local") return
      if (changes[ACCESS_TOKEN_KEY]) {
        const token = changes[ACCESS_TOKEN_KEY].newValue
        setLoggedIn(typeof token === "string" && Boolean(token))
      }
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  useEffect(() => {
    const onMessage = (message: ExtensionMessage) => {
      if (message.type !== "FILL_STREAM") return
      if (message.event === "start") {
        streamedRef.current = false
        adapter.beginFillSession?.()
        return
      }
      if (message.event === "target") {
        adapter.highlightTarget?.({ id: message.id, givenId: message.givenId })
        return
      }
      if (message.event === "answers") {
        streamedRef.current = true
        if (message.answers.length > 0) adapter.fillFields(message.answers)
        return
      }
      if (message.event === "done") {
        streamedRef.current = true
        if (message.answers.length > 0) adapter.fillFields(message.answers)
        adapter.highlightTarget?.({})
      }
      if (message.event === "error") {
        adapter.highlightTarget?.({})
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [adapter])

  async function handleAutofill() {
    if (!loggedIn) {
      await sendMessageWithTimeout({ type: "OPEN_LOGIN" }, 5000)
      return
    }
    setStatus("filling")
    setErrorMessage("")
    streamedRef.current = false
    try {
      // Wait the full fill budget - do not abort if the service-worker
      // message port closes mid-request. See requestFillFromBackground.
      const result = await requestFillFromBackground()
      if (result && result.ok) {
        // Stream path already applied answers as they closed. Only fill
        // the final batch when we never got FILL_STREAM (JSON fallback).
        if (
          !streamedRef.current &&
          Array.isArray(result.answers) &&
          result.answers.length > 0
        ) {
          adapter.fillFields(result.answers)
        }
        setStatus("done")
      } else {
        setErrorMessage(result?.error || "No response from the extension.")
        setStatus("error")
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unknown error")
      setStatus("error")
    }
  }

  async function handleSaveJob() {
    if (!loggedIn) {
      await sendMessageWithTimeout({ type: "OPEN_LOGIN" }, 5000)
      return
    }
    setSaveStatus("saving")
    setSaveMessage("")
    try {
      const result = await sendMessageWithTimeout<SaveJobResult>(
        { type: "SAVE_JOB", pageHtml: capturePageHtml(), meta: capturePageMeta() },
        FILL_REQUEST_TIMEOUT_MS
      )
      if (result?.ok) {
        const label = [result.role, result.company].filter(Boolean).join(" at ")
        setSaveMessage(result.created ? `Saved${label ? ` ${label}` : ""}.` : `Updated${label ? ` ${label}` : ""}.`)
        setSaveStatus("done")
      } else {
        setSaveMessage(result?.error || "Could not save this job.")
        setSaveStatus("error")
      }
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Could not save this job.")
      setSaveStatus("error")
    }
  }

  if (onWebsite) {
    return null
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="Open Form Filler"
        style={launcherStyle}>
        ⚡
      </button>
    )
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>⚡ Form Filler</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          style={closeButtonStyle}
          title="Minimize">
          &#8211;
        </button>
      </div>
      <div style={bodyStyle}>
        <button
          type="button"
          onClick={handleAutofill}
          disabled={status === "filling"}
          style={primaryButtonStyle}>
          {status === "filling"
            ? "Filling..."
            : loggedIn
              ? "⚡ Autofill"
              : "Sign in to autofill"}
        </button>
        <button
          type="button"
          onClick={handleSaveJob}
          disabled={saveStatus === "saving"}
          style={secondaryButtonStyle}>
          {saveStatus === "saving" ? "Saving job..." : loggedIn ? "💾 Save job" : "Sign in to save job"}
        </button>
        {saveStatus === "saving" && (
          <p style={statusStyle("#6b7280")}>Reading this page. This can take a minute.</p>
        )}
        {saveStatus === "done" && <p style={statusStyle("#16a34a")}>{saveMessage}</p>}
        {saveStatus === "error" && (
          <p style={statusStyle("#dc2626")}>{saveMessage || "Could not save this job."}</p>
        )}
        {status === "filling" && (
          <p style={statusStyle("#6b7280")}>This can take a few minutes.</p>
        )}
        {status === "done" && (
          <p style={statusStyle("#16a34a")}>Filled the page.</p>
        )}
        {status === "error" && (
          <p style={statusStyle("#dc2626")}>
            {errorMessage || "Something went wrong. Is the backend running?"}
          </p>
        )}
      </div>
    </div>
  )
}

export default JobBotPanel
