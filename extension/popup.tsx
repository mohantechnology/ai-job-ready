import { useState } from "react"

import { requestFillFromBackground } from "~lib/messaging"

function IndexPopup() {
  const [status, setStatus] = useState<"idle" | "filling" | "done" | "error">(
    "idle"
  )
  const [errorMessage, setErrorMessage] = useState("")

  async function handleFillClick() {
    setStatus("filling")
    try {
      const result = await requestFillFromBackground()
      if (result && result.ok) {
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

  return (
    <div style={{ padding: 16, width: 240, fontFamily: "sans-serif" }}>
      <h3 style={{ margin: "0 0 8px" }}>Job Bot</h3>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#555" }}>
        Detects fillable fields on this page and asks the backend to fill
        them from your saved profile.
      </p>
      <button onClick={handleFillClick} disabled={status === "filling"}>
        {status === "filling" ? "Filling..." : "Fill this page"}
      </button>
      {status === "done" && (
        <p style={{ color: "green", fontSize: 12 }}>Sent fill request.</p>
      )}
      {status === "error" && (
        <p style={{ color: "crimson", fontSize: 12 }}>
          {errorMessage || "Something went wrong. Is the backend running?"}
        </p>
      )}
    </div>
  )
}

export default IndexPopup
