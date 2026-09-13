/**
 * Compact review chip inserted next to a form field (next sibling, not
 * `position: fixed`) so it scrolls with the page. Shadow root keeps host
 * CSS from restyling the buttons. Removed when the user Saves or Closes.
 *
 * Two uses:
 * - Uncertain fills (`guessed` or confidence < 6): Save / Undo / Clear / Close
 * - Skipped fields the user later typed by hand: Save / Close
 */

const ACTIVE_PROMPTS = new WeakMap<HTMLElement, HTMLElement>()
const REVIEW_ATTR = "data-jobbot-review"
const REVIEW_FOR_ATTR = "data-jobbot-review-for"
const FIELD_HIGHLIGHT_STYLE_ID = "jobbot-review-field-style"

const SAVE_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h11l4 4v12H5V4Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M8 4v6h8V4M8 20v-6h8v6" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>`
const UNDO_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.2-5.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M20 4.5V10h-5.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const CLEAR_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.8 4.4 4.6 14.6a2.2 2.2 0 0 0 0 3.1l1.7 1.7a2.2 2.2 0 0 0 3.1 0L19.6 8.6a2.2 2.2 0 0 0 0-3.1l-1.7-1.7a2.2 2.2 0 0 0-3.1.6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M11.2 8 17 13.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 20.5h9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
const CLOSE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`

function attachIdFor(anchorEl: HTMLElement): string {
  const nativeId = anchorEl.getAttribute("id") || anchorEl.getAttribute("data-jobbot-id") || ""
  const safe = nativeId.replace(/[^a-zA-Z0-9_-]/g, "") || `anon-${Date.now().toString(36)}`
  return `jobbot-review-${safe}`
}

/**
 * Insert after the field, or after a wrapping <label> so clicks on our
 * buttons don't also toggle a checkbox/radio via the label.
 */
function insertionAnchor(el: HTMLElement): HTMLElement {
  const label = el.closest("label")
  if (label && label.contains(el)) return label
  return el
}

const HIGHLIGHT_VAR = "--jobbot-highlight"
const FALLBACK_HIGHLIGHT = "#2563eb"

function isUsableColor(color: string): boolean {
  const c = color.replace(/\s+/g, "").toLowerCase()
  if (!c || c === "transparent" || c === "rgba(0,0,0,0)") return false
  // White (or near-white) is the animation start, so it cannot also be the target.
  if (
    c === "white" ||
    c === "#fff" ||
    c === "#ffffff" ||
    c === "rgb(255,255,255)" ||
    c === "rgba(255,255,255,1)"
  ) {
    return false
  }
  return true
}

/** Prefer the field's own outline, then border; otherwise blue. */
function highlightColorFor(el: HTMLElement): string {
  const style = window.getComputedStyle(el)
  const outlineWidth = parseFloat(style.outlineWidth) || 0
  if (style.outlineStyle !== "none" && outlineWidth > 0 && isUsableColor(style.outlineColor)) {
    return style.outlineColor
  }
  const borderWidth = parseFloat(style.borderTopWidth) || 0
  const borderStyle = style.borderTopStyle || style.borderStyle
  const borderColor = style.borderTopColor || style.borderColor
  if (borderStyle !== "none" && borderWidth > 0 && isUsableColor(borderColor)) {
    return borderColor
  }
  return FALLBACK_HIGHLIGHT
}

function ensureFieldHighlightStyles(): void {
  if (document.getElementById(FIELD_HIGHLIGHT_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = FIELD_HIGHLIGHT_STYLE_ID
  style.textContent = `
    @property --jobbot-pulse {
      syntax: "<color>";
      inherits: false;
      initial-value: #ffffff;
    }
    @keyframes jobbot-field-pulse {
      0%, 100% { --jobbot-pulse: #ffffff; }
      50% { --jobbot-pulse: var(${HIGHLIGHT_VAR}, ${FALLBACK_HIGHLIGHT}); }
    }
    [${REVIEW_FOR_ATTR}] {
      --jobbot-pulse: #ffffff;
      outline: 2px solid var(--jobbot-pulse) !important;
      outline-offset: 2px !important;
      animation: jobbot-field-pulse 2.8s ease-in-out infinite;
      border-radius: 4px;
    }
  `
  document.documentElement.appendChild(style)
}

export function dismissSavePrompt(anchorEl: HTMLElement): void {
  ACTIVE_PROMPTS.get(anchorEl)?.remove()
  ACTIVE_PROMPTS.delete(anchorEl)
  anchorEl.removeAttribute(REVIEW_FOR_ATTR)
  anchorEl.style.removeProperty(HIGHLIGHT_VAR)
}

const CHIP_STYLES = `
  :host {
    all: initial;
    display: inline-flex !important;
    vertical-align: middle;
    margin-left: 8px;
    z-index: 2147483647;
  }
  .chip {
    font-family: system-ui, -apple-system, sans-serif;
    background: #0f172a;
    color: #f8fafc;
    border-radius: 999px;
    padding: 4px 5px 4px 5px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    line-height: 0;
    white-space: nowrap;
    vertical-align: middle;
    border: 2px solid #fbbf24;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.28);
  }
  button {
    cursor: pointer;
    border: none;
    border-radius: 999px;
    width: 30px;
    height: 30px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: #1e293b;
    transition: transform 0.12s ease, filter 0.12s ease, background 0.12s ease;
  }
  button:hover { transform: scale(1.08); filter: brightness(1.12); }
  button:active { transform: scale(0.96); }
  .save { background: #16a34a; color: #ecfdf5; }
  .save:hover { background: #15803d; }
  .undo { background: #2563eb; color: #eff6ff; }
  .undo:hover { background: #1d4ed8; }
  .clear { background: #d97706; color: #fffbeb; }
  .clear:hover { background: #b45309; }
  .close { background: #334155; color: #e2e8f0; }
  .close:hover { background: #475569; }
`

function mountChip(anchorEl: HTMLElement, html: string): { host: HTMLElement; shadow: ShadowRoot; dismiss: () => void } {
  dismissSavePrompt(anchorEl)
  ensureFieldHighlightStyles()

  const host = document.createElement("span")
  const attachId = attachIdFor(anchorEl)
  host.id = attachId
  host.setAttribute(REVIEW_ATTR, attachId)
  host.setAttribute("data-jobbot-anchor", "1")

  insertionAnchor(anchorEl).insertAdjacentElement("afterend", host)
  anchorEl.style.setProperty(HIGHLIGHT_VAR, highlightColorFor(anchorEl))
  anchorEl.setAttribute(REVIEW_FOR_ATTR, attachId)

  const shadow = host.attachShadow({ mode: "open" })
  shadow.innerHTML = html

  const dismiss = () => {
    host.remove()
    ACTIVE_PROMPTS.delete(anchorEl)
    anchorEl.removeAttribute(REVIEW_FOR_ATTR)
    anchorEl.style.removeProperty(HIGHLIGHT_VAR)
  }

  ACTIVE_PROMPTS.set(anchorEl, host)
  return { host, shadow, dismiss }
}

function bindChipButtons(
  shadow: ShadowRoot,
  dismiss: () => void,
  handlers: { onSave?: () => void; onClear?: () => void; onUndo?: () => void }
): void {
  const stop = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  shadow.querySelector(".save")?.addEventListener("click", (event) => {
    stop(event)
    handlers.onSave?.()
    dismiss()
  })
  shadow.querySelector(".undo")?.addEventListener("click", (event) => {
    stop(event)
    handlers.onUndo?.()
  })
  shadow.querySelector(".clear")?.addEventListener("click", (event) => {
    stop(event)
    handlers.onClear?.()
  })
  shadow.querySelector(".close")?.addEventListener("click", (event) => {
    stop(event)
    dismiss()
  })
}

/**
 * Compact "save this answer" chip for a field the user just filled in by
 * hand (one the LLM skipped).
 */
export function showSavePrompt(
  anchorEl: HTMLElement,
  _label: string,
  onSave: () => void
): void {
  const { shadow, dismiss } = mountChip(
    anchorEl,
    `
    <style>${CHIP_STYLES}</style>
    <span class="chip">
      <button class="save" type="button" title="Save this answer for next time" aria-label="Save this answer for next time">${SAVE_ICON}</button>
      <button class="close" type="button" title="Close" aria-label="Close">${CLOSE_ICON}</button>
    </span>
    `
  )
  bindChipButtons(shadow, dismiss, { onSave })
}

export type UncertainPromptOptions = {
  getValue: () => string
  onSave: (value: string) => void
  onClear: () => void
  onUndo: () => void
}

/**
 * Review chip for a guessed or low-confidence fill: Save / Undo / Clear / Close.
 * Undo and Clear leave the chip open so the user can restore or save after.
 */
export function showUncertainPrompt(anchorEl: HTMLElement, options: UncertainPromptOptions): void {
  const { shadow, dismiss } = mountChip(
    anchorEl,
    `
    <style>${CHIP_STYLES}</style>
    <span class="chip">
      <button class="save" type="button" title="Save this answer for next time" aria-label="Save this answer for next time">${SAVE_ICON}</button>
      <button class="undo" type="button" title="Restore the original fill" aria-label="Restore the original fill">${UNDO_ICON}</button>
      <button class="clear" type="button" title="Clear this fill" aria-label="Clear this fill">${CLEAR_ICON}</button>
      <button class="close" type="button" title="Close" aria-label="Close">${CLOSE_ICON}</button>
    </span>
    `
  )

  bindChipButtons(shadow, dismiss, {
    onSave: () => {
      const value = options.getValue().trim()
      if (value) options.onSave(value)
    },
    onClear: options.onClear,
    onUndo: options.onUndo
  })
}
