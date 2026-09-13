import { useEffect, useState } from "react"

function IndexOptions() {
  const [profile, setProfile] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    chrome.storage.local.get("profile").then((result) => {
      if (typeof result.profile === "string") setProfile(result.profile)
    })
  }, [])

  async function handleSave() {
    await chrome.storage.local.set({ profile })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div style={{ padding: 24, maxWidth: 560, fontFamily: "sans-serif" }}>
      <h2>Job Bot - Profile</h2>
      <p style={{ color: "#555", fontSize: 14 }}>
        Paste your resume/profile info below. This stays on your device
        (chrome.storage.local) and is only sent to your configured backend
        when filling a form - never directly to OpenAI.
      </p>
      <textarea
        value={profile}
        onChange={(e) => setProfile(e.target.value)}
        rows={16}
        style={{ width: "100%", fontFamily: "inherit", fontSize: 14 }}
        placeholder="Name, contact info, work history, skills, links..."
      />
      <div style={{ marginTop: 12 }}>
        <button onClick={handleSave}>Save</button>
        {saved && (
          <span style={{ marginLeft: 8, color: "green", fontSize: 13 }}>
            Saved
          </span>
        )}
      </div>
    </div>
  )
}

export default IndexOptions
