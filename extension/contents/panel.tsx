import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import type { PlasmoCSConfig } from "plasmo"

import { getAdapterForHostname } from "~adapters"
import { ACCESS_TOKEN_KEY, isWebOrigin } from "~lib/auth"
import type { ExtensionMessage, JobSummaryPayload, PageMeta, SaveJobResult, SummarizeJobResult } from "~lib/messaging"
import { FILL_REQUEST_TIMEOUT_MS, PANEL_CLOSED_KEY, requestFillFromBackground, sendMessageWithTimeout } from "~lib/messaging"
import {
  PANEL_LAYOUT_KEY,
  PANEL_REVEAL_KEY,
  clampFrame,
  defaultFrame,
  expandedFrame,
  applyResize,
  moveFrame,
  readStoredLayout,
  type PanelFrame,
  type ResizeEdge
} from "~lib/panelLayout"

// Same broad matches as the field-detection content script - this panel is
// the primary way users trigger a fill, so it needs to be present anywhere
// detect.ts is.
export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  run_at: "document_idle"
}

type FillStatus = "idle" | "filling" | "done" | "error"
type SaveStatus = "idle" | "saving" | "done" | "error"
type SummaryStatus = "idle" | "loading" | "done" | "error"

const MAX_PAGE_HTML_CHARS = 2_000_000

const PANEL_CSS = `
  .jrp-panel, .jrp-launcher {
    font-family: "Sora", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-sizing: border-box;
  }
  .jrp-panel *, .jrp-launcher * { box-sizing: border-box; }
  .jrp-launcher {
    position: fixed;
    bottom: 18px;
    right: 18px;
    width: 56px;
    height: 56px;
    border: none;
    border-radius: 18px;
    cursor: pointer;
    color: #fff;
    background: linear-gradient(160deg, #4f46e5 0%, #7c3aed 100%);
    box-shadow: 0 10px 24px rgba(79, 70, 229, 0.38), 0 0 0 4px rgba(255,255,255,0.85);
    z-index: 2147483647;
    display: grid;
    place-items: center;
  }
  .jrp-launcher:hover { filter: brightness(1.06); }
  .jrp-panel {
    position: fixed;
    display: flex;
    flex-direction: column;
    border-radius: 20px;
    overflow: hidden;
    background: #fbfbfe;
    color: #1e1b3a;
    border: 1px solid rgba(79, 70, 229, 0.12);
    box-shadow: 0 18px 50px rgba(24, 18, 58, 0.22), 0 2px 8px rgba(24, 18, 58, 0.06);
    z-index: 2147483647;
  }
  .jrp-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 14px 13px;
    cursor: grab;
    user-select: none;
    touch-action: none;
    z-index: 2;
    background:
      radial-gradient(120px 60px at 100% 0%, rgba(255,255,255,0.22), transparent 70%),
      linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
    color: #fff;
    flex-shrink: 0;
  }
  .jrp-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .jrp-mark {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: rgba(255,255,255,0.18);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .jrp-title { font-size: 14px; font-weight: 700; letter-spacing: 0.1px; line-height: 1.2; }
  .jrp-sub { margin-top: 2px; font-size: 11px; color: rgba(255,255,255,0.78); line-height: 1.2; }
  .jrp-window { position: relative; z-index: 3; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .jrp-icon {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 9px;
    background: rgba(255,255,255,0.16);
    color: #fff;
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
  }
  .jrp-icon:hover { background: rgba(255,255,255,0.28); }
  .jrp-icon:focus-visible, .jrp-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .jrp-panel.jrp-moving .jrp-header { cursor: grabbing; }
  .jrp-scroll {
    overflow: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    min-height: 0;
  }
  .jrp-expanded .jrp-summary { font-size: 14.5px; line-height: 1.55; }
  .jrp-expanded .jrp-card { max-width: 820px; }
  .jrp-resize {
    position: absolute;
    z-index: 3;
    touch-action: none;
  }
  .jrp-n, .jrp-s { left: 14px; right: 14px; height: 8px; cursor: ns-resize; }
  .jrp-n { top: 0; left: 64px; right: 132px; height: 10px; z-index: 1; }
  .jrp-s { bottom: 0; }
  .jrp-e, .jrp-w { top: 14px; bottom: 14px; width: 8px; cursor: ew-resize; }
  .jrp-e { right: 0; }
  .jrp-w { left: 0; }
  .jrp-nw, .jrp-ne, .jrp-sw, .jrp-se { width: 10px; height: 10px; z-index: 4; }
  .jrp-nw { top: 0; left: 0; cursor: nwse-resize; }
  .jrp-se { right: 0; bottom: 0; cursor: nwse-resize; }
  .jrp-ne { top: 0; right: 0; cursor: nesw-resize; }
  .jrp-sw { bottom: 0; left: 0; cursor: nesw-resize; }
  .jrp-scroll::-webkit-scrollbar { width: 8px; }
  .jrp-scroll::-webkit-scrollbar-thumb { background: #dddde8; border-radius: 99px; }
  .jrp-actions { display: flex; flex-direction: column; gap: 8px; }
  .jrp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .jrp-btn {
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    line-height: 1.2;
  }
  .jrp-btn:disabled { cursor: default; opacity: 0.62; }
  .jrp-btn-primary {
    border: none;
    color: #fff;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    box-shadow: 0 8px 16px rgba(79, 70, 229, 0.28);
  }
  .jrp-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
  .jrp-btn-ghost {
    border: 1px solid #e4e4f2;
    background: #fff;
    color: #312e81;
  }
  .jrp-btn-ghost:hover:not(:disabled) { background: #f5f5ff; }
  .jrp-note { margin: 0; font-size: 12px; line-height: 1.45; }
  .jrp-note-muted { color: #6b6b85; }
  .jrp-note-ok { color: #15803d; }
  .jrp-note-bad { color: #dc2626; }
  .jrp-card {
    background: #fff;
    border: 1px solid #ececf6;
    border-radius: 16px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .jrp-role-copy {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: #2e2a48;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .jrp-role { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.3; }
  .jrp-company { margin: 2px 0 0; font-size: 12.5px; color: #5b5878; }
  .jrp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .jrp-chip {
    font-size: 11px;
    font-weight: 600;
    color: #4338ca;
    background: #eef0ff;
    border-radius: 999px;
    padding: 4px 8px;
  }
  .jrp-kicker {
    margin: 0;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #8a8aa3;
  }
  .jrp-summary { margin: 0; font-size: 12.5px; line-height: 1.5; color: #2e2a48; }
  .jrp-fit {
    display: flex;
    gap: 12px;
    align-items: center;
    background: #f7f7fd;
    border-radius: 14px;
    padding: 10px;
  }
  .jrp-ring {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: conic-gradient(var(--ring, #4f46e5) calc(var(--p) * 1%), #e6e6f2 0);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .jrp-ring span {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #fff;
    display: grid;
    place-items: center;
    font-size: 16px;
    font-weight: 700;
    color: #1e1b3a;
  }
  .jrp-fit-copy { min-width: 0; flex: 1; }
  .jrp-fit-label { font-size: 14px; font-weight: 700; line-height: 1.2; }
  .jrp-hear {
    display: inline-flex;
    margin-top: 6px;
    font-size: 11px;
    font-weight: 700;
    border-radius: 999px;
    padding: 3px 8px;
  }
  .jrp-hear-likely { background: #dcfce7; color: #166534; }
  .jrp-hear-possible { background: #fef3c7; color: #92400e; }
  .jrp-hear-unlikely { background: #fee2e2; color: #991b1b; }
  .jrp-meter { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: #ececf4; }
  .jrp-meter i { display: block; height: 100%; }
  .jrp-meter-match { background: #16a34a; }
  .jrp-meter-partial { background: #d97706; }
  .jrp-meter-missing { background: #e11d48; }
  .jrp-legend { display: flex; gap: 10px; font-size: 11px; color: #6b6b85; }
  .jrp-legend b { font-weight: 700; color: #1e1b3a; }
  .jrp-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .jrp-signal {
    display: grid;
    grid-template-columns: 8px 1fr;
    gap: 8px;
    align-items: start;
    font-size: 12px;
    line-height: 1.35;
  }
  .jrp-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; }
  .jrp-signal-match .jrp-dot { background: #16a34a; }
  .jrp-signal-partial .jrp-dot { background: #d97706; }
  .jrp-signal-missing .jrp-dot { background: #e11d48; }
  .jrp-signal-label { font-weight: 600; color: #1e1b3a; }
  .jrp-signal-note { display: block; color: #6b6b85; font-weight: 400; }
  .jrp-split { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .jrp-mini { margin: 0; padding-left: 16px; font-size: 12px; color: #2e2a48; line-height: 1.4; }
  .jrp-banner {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: #4338ca;
    background: #eef0ff;
    border-radius: 12px;
    padding: 8px 10px;
  }
  .jrp-fine { margin: 0; font-size: 10.5px; line-height: 1.4; color: #8a8aa3; }
  .jrp-points { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 6px; }
  .jrp-points li { font-size: 12.5px; line-height: 1.45; color: #2e2a48; }
  .jrp-tasks { display: flex; flex-direction: column; gap: 8px; }
  .jrp-task {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    border-radius: 14px;
    padding: 10px 12px;
    border: 1px solid transparent;
  }
  .jrp-task-running { background: #f5f3ff; border-color: #ddd6fe; }
  .jrp-task-ok { background: #f0fdf4; border-color: #bbf7d0; }
  .jrp-task-bad { background: #fef2f2; border-color: #fecaca; }
  .jrp-task-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    margin-top: 1px;
  }
  .jrp-task-title { display: block; font-size: 13px; font-weight: 700; line-height: 1.3; }
  .jrp-task-running .jrp-task-title { color: #5b21b6; }
  .jrp-task-ok .jrp-task-title { color: #166534; }
  .jrp-task-bad .jrp-task-title { color: #991b1b; }
  .jrp-task-detail { display: block; margin-top: 2px; font-size: 12px; line-height: 1.4; color: #4b4b63; }
  .jrp-spin {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid #ddd6fe;
    border-top-color: #6d28d9;
    animation: jrp-spin 0.7s linear infinite;
    display: block;
  }
  @keyframes jrp-spin { to { transform: rotate(360deg); } }
`

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

function levelLabel(level: string): string {
  if (level === "junior") return "Junior"
  if (level === "senior") return "Senior"
  if (level === "mid") return "Mid"
  return level
}

function hearBackClass(hearBack: string): string {
  if (hearBack === "Likely") return "jrp-hear jrp-hear-likely"
  if (hearBack === "Possible") return "jrp-hear jrp-hear-possible"
  return "jrp-hear jrp-hear-unlikely"
}

function ringColor(score: number): string {
  if (score >= 75) return "#16a34a"
  if (score >= 50) return "#d97706"
  return "#e11d48"
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 7h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M10.2 1.5 4 10.2h4.2L7.6 16.5 14 7.6H9.6L10.2 1.5Z" fill="currentColor" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M8.5 2.5H11.5V5.5M5.5 11.5H2.5V8.5M11.5 2.5 8 6M2.5 11.5 6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M5.5 2.5H2.5V5.5M8.5 11.5H11.5V8.5M2.5 2.5 6 6M11.5 11.5 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.5 13.5 13H2.5L8 3.5Z" stroke="#dc2626" strokeWidth="1.4" fill="none" />
      <path d="M8 7v3" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

const RESIZE_EDGES: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"]

function currentViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

function TaskStatus({ tone, title, detail }: { tone: "running" | "ok" | "bad"; title: string; detail: string }) {
  return (
    <div className={`jrp-task jrp-task-${tone}`} role="status">
      <span className="jrp-task-icon">
        {tone === "running" ? <span className="jrp-spin" /> : tone === "ok" ? <CheckIcon /> : <AlertIcon />}
      </span>
      <span>
        <span className="jrp-task-title">{title}</span>
        <span className="jrp-task-detail">{detail}</span>
      </span>
    </div>
  )
}

function SummaryView({ summary }: { summary: JobSummaryPayload }) {
  if (!summary.isJobPosting || !summary.job) {
    return (
      <div className="jrp-card">
        <p className="jrp-kicker">This page</p>
        <p className="jrp-summary">{summary.note || "This page does not look like a single job posting."}</p>
      </div>
    )
  }

  const { job, fit } = summary
  const facts = [
    job.location,
    job.workMode,
    job.level === "junior" || job.level === "senior" ? levelLabel(job.level) : "",
    job.salary
  ].filter(Boolean)
  const compared = fit.comparedCount || 0

  const points = job.importantPoints || []

  return (
    <div className="jrp-card">
      {fit.available && compared > 0 ? (
        <>
          <div className="jrp-fit">
            <div className="jrp-ring" style={{ ["--p" as string]: String(fit.fitScore), ["--ring" as string]: ringColor(fit.fitScore) }}>
              <span>{fit.fitScore}</span>
            </div>
            <div className="jrp-fit-copy">
              <div className="jrp-fit-label">{fit.fitLabel}</div>
              <span className={hearBackClass(fit.hearBack)}>Hear back: {fit.hearBack}</span>
            </div>
          </div>
          <div className="jrp-meter" aria-hidden="true">
            <i className="jrp-meter-match" style={{ width: `${(fit.matchedCount / compared) * 100}%` }} />
            <i className="jrp-meter-partial" style={{ width: `${(fit.partialCount / compared) * 100}%` }} />
            <i className="jrp-meter-missing" style={{ width: `${(fit.missingCount / compared) * 100}%` }} />
          </div>
          <div className="jrp-legend">
            <span><b>{fit.matchedCount}</b> match</span>
            <span><b>{fit.partialCount}</b> partial</span>
            <span><b>{fit.missingCount}</b> missing</span>
          </div>
          {fit.hearBackNote && <p className="jrp-summary">{fit.hearBackNote}</p>}
        </>
      ) : (
        <p className="jrp-banner">{fit.note || "Fit score is unavailable for this page."}</p>
      )}

      <div>
        <p className="jrp-role">{job.role}</p>
        <p className="jrp-company">{job.company}</p>
      </div>
      {facts.length > 0 && (
        <div className="jrp-chips">
          {facts.map((fact) => (
            <span key={fact} className="jrp-chip">
              {fact}
            </span>
          ))}
        </div>
      )}
      {job.summary && (
        <div>
          <p className="jrp-kicker">The role</p>
          <p className="jrp-role-copy">{job.summary}</p>
        </div>
      )}
      {job.requirements.length > 0 && (
        <div>
          <p className="jrp-kicker">Requirements</p>
          <div className="jrp-chips">
            {job.requirements.map((item) => (
              <span key={item} className="jrp-chip">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
      {points.length > 0 && (
        <div>
          <p className="jrp-kicker">Important points</p>
          <ul className="jrp-points">
            {points.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {fit.signals.length > 0 && (
        <div>
          <p className="jrp-kicker">How you line up</p>
          <ul className="jrp-list">
            {fit.signals.map((signal) => (
              <li key={`${signal.status}-${signal.item}`} className={`jrp-signal jrp-signal-${signal.status}`}>
                <span className="jrp-dot" />
                <span>
                  <span className="jrp-signal-label">{signal.item}</span>
                  {signal.note && <span className="jrp-signal-note">{signal.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(fit.strengths.length > 0 || fit.gaps.length > 0) && (
        <div className="jrp-split">
          {fit.strengths.length > 0 && (
            <div>
              <p className="jrp-kicker">Strengths</p>
              <ul className="jrp-mini">
                {fit.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {fit.gaps.length > 0 && (
            <div>
              <p className="jrp-kicker">Gaps</p>
              <ul className="jrp-mini">
                {fit.gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {fit.available && compared > 0 && (
        <p className="jrp-fine">
          Estimate from this posting and your JobReady profile or resume. It is not a prediction of what the employer will do.
        </p>
      )}
    </div>
  )
}

type DragState = {
  pointerId: number
  mode: "move" | ResizeEdge
  startPointerX: number
  startPointerY: number
  startFrame: PanelFrame
}

function JobBotPanel() {
  const [closed, setClosed] = useState<boolean | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [frame, setFrame] = useState<PanelFrame | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [live, setLive] = useState<PanelFrame | null>(null)
  const [moving, setMoving] = useState(false)
  const [viewSize, setViewSize] = useState(currentViewport)
  const frameRef = useRef<PanelFrame | null>(null)
  const expandedRef = useRef(false)
  const dragRef = useRef<DragState | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [status, setStatus] = useState<FillStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [saveMessage, setSaveMessage] = useState("")
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>("idle")
  const [summaryError, setSummaryError] = useState("")
  const [summary, setSummary] = useState<JobSummaryPayload | null>(null)
  const streamedRef = useRef(false)
  const adapter = getAdapterForHostname(window.location.hostname)
  const onWebsite = isWebOrigin(window.location.origin)

  useEffect(() => {
    let active = true
    chrome.storage.local.get(PANEL_CLOSED_KEY).then((result) => {
      if (!active) return
      setClosed(result[PANEL_CLOSED_KEY] === true)
    }).catch(() => {
      if (active) setClosed(false)
    })

    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== "local") return
      if (changes[PANEL_CLOSED_KEY]) {
        setClosed(changes[PANEL_CLOSED_KEY].newValue === true)
      }
      if (changes[PANEL_REVEAL_KEY] || (changes[PANEL_CLOSED_KEY] && changes[PANEL_CLOSED_KEY].newValue !== true)) {
        setClosed(false)
        setCollapsed(false)
      }
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      active = false
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [])

  useEffect(() => {
    const view = currentViewport()
    chrome.storage.local.get(PANEL_LAYOUT_KEY).then((result) => {
      const stored = readStoredLayout(result[PANEL_LAYOUT_KEY], view)
      if (stored) {
        frameRef.current = stored.frame
        expandedRef.current = stored.expanded
        setFrame(stored.frame)
        setExpanded(stored.expanded)
      } else {
        const initial = defaultFrame(view)
        frameRef.current = initial
        setFrame(initial)
      }
    }).catch(() => {
      const initial = defaultFrame(view)
      frameRef.current = initial
      setFrame(initial)
    })
  }, [])

  useEffect(() => {
    const onResize = () => {
      const view = currentViewport()
      setViewSize(view)
      if (expandedRef.current) {
        setLive((current) => (current ? clampFrame(current, view) : null))
        return
      }
      const current = frameRef.current
      if (!current) return
      const next = clampFrame(current, view)
      frameRef.current = next
      setFrame(next)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  function saveLayout(next: PanelFrame, nextExpanded: boolean) {
    chrome.storage.local.set({ [PANEL_LAYOUT_KEY]: { ...next, expanded: nextExpanded } }).catch(() => {})
  }

  function onDragStart(event: ReactPointerEvent, mode: "move" | ResizeEdge) {
    if (mode === "move" && (event.target as HTMLElement).closest("button")) return
    const start = expandedRef.current ? live ?? expandedFrame(currentViewport()) : frameRef.current
    if (!start) return
    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startFrame: start
    }
    setMoving(true)
  }

  function onDragMove(event: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const dx = event.clientX - drag.startPointerX
    const dy = event.clientY - drag.startPointerY
    const view = currentViewport()
    const next = drag.mode === "move"
      ? clampFrame(moveFrame(drag.startFrame, dx, dy), view)
      : applyResize(drag.mode, drag.startFrame, dx, dy, view)
    if (expandedRef.current) {
      setLive(next)
      return
    }
    frameRef.current = next
    setFrame(next)
  }

  function onDragEnd(event: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    dragRef.current = null
    setMoving(false)
    if (!expandedRef.current && frameRef.current) saveLayout(frameRef.current, false)
  }

  function toggleExpand() {
    const next = !expandedRef.current
    expandedRef.current = next
    setExpanded(next)
    setLive(null)
    if (frameRef.current) saveLayout(frameRef.current, next)
  }

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
      const result = await requestFillFromBackground()
      if (result && result.ok) {
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

  async function handleSummarize() {
    if (!loggedIn) {
      await sendMessageWithTimeout({ type: "OPEN_LOGIN" }, 5000)
      return
    }
    setSummaryStatus("loading")
    setSummaryError("")
    try {
      const result = await sendMessageWithTimeout<SummarizeJobResult>(
        { type: "SUMMARIZE_JOB", pageHtml: capturePageHtml(), meta: capturePageMeta() },
        FILL_REQUEST_TIMEOUT_MS
      )
      if (result?.ok && result.summary) {
        setSummary(result.summary)
        setSummaryStatus("done")
      } else {
        setSummaryError(result?.error || "Could not analyze this page.")
        setSummaryStatus("error")
      }
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Could not analyze this page.")
      setSummaryStatus("error")
    }
  }

  async function handleClose() {
    setClosed(true)
    try {
      await chrome.storage.local.set({ [PANEL_CLOSED_KEY]: true })
    } catch {
      // The panel still hides for this page if storage is unavailable.
    }
  }

  if (onWebsite || closed === null || closed) {
    return null
  }

  if (collapsed) {
    return (
      <button type="button" className="jrp-launcher" onClick={() => setCollapsed(false)} title="Open JobReady">
        <style>{PANEL_CSS}</style>
        <BoltIcon />
      </button>
    )
  }

  if (!frame) return null

  const shown = expanded ? live ?? expandedFrame(viewSize) : frame
  const busyAnalyze = summaryStatus === "loading"

  return (
    <div
      className={`jrp-panel${expanded ? " jrp-expanded" : ""}${moving ? " jrp-moving" : ""}`}
      style={{ left: shown.x, top: shown.y, width: shown.width, height: shown.height }}>
      <style>{PANEL_CSS}</style>
      <div
        className="jrp-header"
        onPointerDown={(event) => onDragStart(event, "move")}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}>
        <div className="jrp-brand">
          <span className="jrp-mark">
            <BoltIcon />
          </span>
          <div>
            <div className="jrp-title">JobReady</div>
            <div className="jrp-sub">Autofill, save, and analyze</div>
          </div>
        </div>
        <div
          className="jrp-resize jrp-n"
          onPointerDown={(event) => onDragStart(event, "n")}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />
        <div className="jrp-window">
          <button
            type="button"
            className="jrp-icon"
            onClick={toggleExpand}
            title={expanded ? "Restore size" : "Expand"}
            aria-label={expanded ? "Restore size" : "Expand"}>
            {expanded ? <RestoreIcon /> : <ExpandIcon />}
          </button>
          <button type="button" className="jrp-icon" onClick={() => setCollapsed(true)} title="Minimize" aria-label="Minimize">
            <MinusIcon />
          </button>
          <button type="button" className="jrp-icon" onClick={handleClose} title="Close" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="jrp-scroll">
        <div className="jrp-actions">
          <button type="button" className="jrp-btn jrp-btn-primary" onClick={handleAutofill} disabled={status === "filling"}>
            {status === "filling" ? "Filling application…" : loggedIn ? "Autofill application" : "Sign in to autofill"}
          </button>
          <div className="jrp-row">
            <button type="button" className="jrp-btn jrp-btn-ghost" onClick={handleSaveJob} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? "Saving job…" : loggedIn ? "Save job" : "Sign in"}
            </button>
            <button type="button" className="jrp-btn jrp-btn-ghost" onClick={handleSummarize} disabled={busyAnalyze}>
              {busyAnalyze ? "Analyzing…" : loggedIn ? "Analyze" : "Sign in"}
            </button>
          </div>
        </div>

        {(status !== "idle" || saveStatus !== "idle" || summaryStatus === "loading" || summaryStatus === "error" || (summaryStatus === "done" && summary)) && (
          <div className="jrp-tasks">
            {status === "filling" && (
              <TaskStatus tone="running" title="Filling the application" detail="Working through the fields on this page. This can take a few minutes." />
            )}
            {status === "done" && (
              <TaskStatus tone="ok" title="Application filled" detail="The fields on this page were updated." />
            )}
            {status === "error" && (
              <TaskStatus tone="bad" title="Autofill didn't finish" detail={errorMessage || "Something went wrong. Is the backend running?"} />
            )}
            {saveStatus === "saving" && (
              <TaskStatus tone="running" title="Saving this job" detail="Reading the posting and storing it. This can take a minute." />
            )}
            {saveStatus === "done" && (
              <TaskStatus tone="ok" title="Job saved" detail={saveMessage || "This posting is in your applied jobs."} />
            )}
            {saveStatus === "error" && (
              <TaskStatus tone="bad" title="Couldn't save this job" detail={saveMessage || "Try again in a moment."} />
            )}
            {summaryStatus === "loading" && (
              <TaskStatus tone="running" title="Analyzing this job" detail="Reading the posting and comparing it with your profile." />
            )}
            {summaryStatus === "error" && (
              <TaskStatus tone="bad" title="Analysis didn't finish" detail={summaryError || "Could not analyze this page."} />
            )}
            {summaryStatus === "done" && summary && (
              <TaskStatus
                tone="ok"
                title="Analysis ready"
                detail={summary.job ? `${summary.job.role} at ${summary.job.company}` : summary.note || "This page was checked."}
              />
            )}
          </div>
        )}

        {summaryStatus === "done" && summary && <SummaryView summary={summary} />}
      </div>
      {RESIZE_EDGES.filter((edge) => edge !== "n").map((edge) => (
        <div
          key={edge}
          className={`jrp-resize jrp-${edge}`}
          onPointerDown={(event) => onDragStart(event, edge)}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />
      ))}
    </div>
  )
}

export default JobBotPanel
