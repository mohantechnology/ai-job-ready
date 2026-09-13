import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"

import type { PlasmoCSConfig } from "plasmo"

import { getAdapterForHostname } from "~adapters"
import type { ExtensionMessage } from "~lib/messaging"
import { requestFillFromBackground } from "~lib/messaging"

// Same broad matches as the field-detection content script - this panel is
// the primary way users trigger a fill, so it needs to be present anywhere
// detect.ts is.
export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  run_at: "document_idle"
}

type FillStatus = "idle" | "filling" | "done" | "error"

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
  const [status, setStatus] = useState<FillStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const streamedRef = useRef(false)
  const adapter = getAdapterForHostname(window.location.hostname)

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

  function handleSaveJob() {
    // Placeholder until job tracking (task.txt) lands - just acknowledges
    // the click for now.
    setStatus("done")
    setTimeout(() => setStatus("idle"), 1500)
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="Open Job Bot"
        style={launcherStyle}>
        ⚡
      </button>
    )
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>⚡ Job Bot</span>
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
          {status === "filling" ? "Filling..." : "⚡ Autofill"}
        </button>
        <button type="button" onClick={handleSaveJob} style={secondaryButtonStyle}>
          💾 Save job
        </button>
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
