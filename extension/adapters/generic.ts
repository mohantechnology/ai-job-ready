import type { FieldAction, FieldAnswer, FieldAnswerDetail, SaveAnswerResult } from "~lib/messaging"
import { sendMessageWithTimeout } from "~lib/messaging"
import { showSavePrompt, showUncertainPrompt } from "~lib/savePrompt"

import type { SiteAdapter } from "./types"

// `file` inputs can't be assigned a value from script (browsers block it for
// security reasons - assigning throws), so they're excluded. `submit`/`button`
// are excluded deliberately too: auto-clicking them risks submitting the form
// or triggering unrelated page actions, which is out of scope for "fill".
const TEXT_LIKE_SELECTOR =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea'
const SELECT_SELECTOR = "select"
const CHECKBOX_SELECTOR = 'input[type="checkbox"]'
const RADIO_SELECTOR = 'input[type="radio"]'
const FILLABLE_SELECTOR = [TEXT_LIKE_SELECTOR, SELECT_SELECTOR, CHECKBOX_SELECTOR, RADIO_SELECTOR].join(", ")

/** Show a review card when the model guessed, or confidence is below this (0-10). */
const UNCERTAIN_CONFIDENCE = 6
const TARGET_ATTR = "data-jobbot-id"
const GENERATING_ATTR = "data-jobbot-generating"
const GENERATING_STYLE_ID = "jobbot-generating-style"

// Streamed fills send answers one-by-one, and detect.ts + panel.tsx are
// separate bundles. Keep the applied set on `window` so they don't both
// write the same field (and stack review chips).
type JobBotWindow = Window & {
  __jobbotApplied?: Set<string>
  __jobbotGenerating?: HTMLElement | null
}

function appliedThisFill(): Set<string> {
  const w = window as JobBotWindow
  if (!w.__jobbotApplied) w.__jobbotApplied = new Set<string>()
  return w.__jobbotApplied
}

function answerKey(answer: FieldAnswer): string {
  if (typeof answer.id === "string" && answer.id) return `id:${answer.id}`
  if (typeof answer.givenId === "string" && answer.givenId) return `gid:${answer.givenId}`
  if (answer.kind === "radio-group") {
    return `rg:${answer.label || ""}:${answer.answer?.[0]?.value || ""}`
  }
  return `anon:${answer.label || ""}:${answer.action}`
}

function beginFillSession(): void {
  appliedThisFill().clear()
  clearGeneratingHighlights()
}

function ensureGeneratingStyles(): void {
  if (document.getElementById(GENERATING_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = GENERATING_STYLE_ID
  style.textContent = `
    @keyframes jobbot-generating-pulse {
      0%, 100% {
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.22), 0 0 12px rgba(139, 92, 246, 0.28);
      }
      50% {
        box-shadow: 0 0 0 6px rgba(99, 102, 241, 0.4), 0 0 22px rgba(139, 92, 246, 0.5);
      }
    }
    [${GENERATING_ATTR}] {
      outline: 2px solid #6366f1 !important;
      outline-offset: 2px !important;
      border-radius: 6px;
      animation: jobbot-generating-pulse 1.15s ease-in-out infinite;
      transition: outline-color 0.2s ease, box-shadow 0.2s ease;
    }
  `
  document.documentElement.appendChild(style)
}

function clearGeneratingOn(el: HTMLElement | null | undefined): void {
  if (!el) return
  el.removeAttribute(GENERATING_ATTR)
  const w = window as JobBotWindow
  if (w.__jobbotGenerating === el) w.__jobbotGenerating = null
}

function clearGeneratingHighlights(): void {
  document.querySelectorAll<HTMLElement>(`[${GENERATING_ATTR}]`).forEach((el) => {
    el.removeAttribute(GENERATING_ATTR)
  })
  ;(window as JobBotWindow).__jobbotGenerating = null
}

function highlightTarget(target: { id?: string; givenId?: string }): void {
  if (!target.id && !target.givenId) {
    clearGeneratingHighlights()
    return
  }

  const el = resolveById(target.id, target.givenId)
  if (!el) return

  const w = window as JobBotWindow
  if (w.__jobbotGenerating === el) return

  clearGeneratingHighlights()
  ensureGeneratingStyles()
  el.setAttribute(GENERATING_ATTR, "true")
  w.__jobbotGenerating = el
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  const style = window.getComputedStyle(el)
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  )
}

function labelFor(el: HTMLElement): string {
  const id = el.getAttribute("id")
  if (id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (byFor?.textContent) return byFor.textContent.trim()
  }

  const ariaLabel = el.getAttribute("aria-label")
  if (ariaLabel) return ariaLabel.trim()

  const wrappingLabel = el.closest("label")
  if (wrappingLabel?.textContent) return wrappingLabel.textContent.trim()

  // Fall back to the nearest preceding text node in the same field group.
  const container = el.closest("div, li, fieldset") ?? el.parentElement
  const precedingText = container?.querySelector("label, span, p")?.textContent
  return precedingText?.trim() ?? ""
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // Prefer the prototype setter (needed for React-controlled inputs). Walk the
  // chain instead of only the immediate prototype - some environments put
  // `value` one level higher. Always fall back to a direct assignment so a
  // missed descriptor never leaves the field blank on a plain HTML form.
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value")
  if (descriptor?.set) {
    descriptor.set.call(el, value)
  } else {
    el.value = value
  }
}

// Counter for generated `data-jobbot-id` values - persists for the life of
// the page (module-level), so re-tagging never reuses an id already handed
// out to a different element.
let targetIdCounter = 0

/**
 * Ensures a fillable element can always be resolved later by either its own
 * native `id` or a durable `data-jobbot-id` attribute we write directly onto
 * it. Written once per element (idempotent) *before* the page HTML is
 * captured, so the exact same marker appears in what the LLM reads and in
 * the live DOM `fillFields` later queries - closing the gap that let
 * in-memory, recomputed fallback ids (e.g. `text-3`) drift between a
 * detect-time scan and a later fill-time scan.
 */
function ensureTargetable(el: HTMLElement): void {
  if (el.id) return
  if (el.hasAttribute(TARGET_ATTR)) return
  el.setAttribute(TARGET_ATTR, `jb-${targetIdCounter++}`)
}

/**
 * Tags every fillable element on the page (see `ensureTargetable`) and
 * returns how many were found, so callers can decide whether there's
 * anything worth sending to the LLM at all.
 */
function tagFillableFields(): number {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(FILLABLE_SELECTOR)).filter(isVisible)
  elements.forEach(ensureTargetable)
  return elements.length
}

// Elements already wired with a manual-answer listener, so re-running
// `fillFields` on a later autofill click doesn't stack duplicate listeners
// on the same DOM node.
const WATCHED_ELEMENTS = new WeakSet<Element>()

function watchForManualAnswer(el: HTMLElement, onManualAnswer: (value: string) => void): void {
  if (WATCHED_ELEMENTS.has(el)) return
  WATCHED_ELEMENTS.add(el)

  const tag = el.tagName.toLowerCase()
  if (tag === "select") {
    const select = el as HTMLSelectElement
    select.addEventListener("change", () => {
      const selected = select.options[select.selectedIndex]
      const value = selected?.textContent?.trim() || selected?.value || ""
      if (value) onManualAnswer(value)
    })
    return
  }

  const type = el.getAttribute("type")
  if (tag === "input" && type === "checkbox") {
    const checkbox = el as HTMLInputElement
    checkbox.addEventListener("change", () => {
      // Only "checking" counts as new data worth remembering - an
      // unchecked box has no positive answer to save.
      if (checkbox.checked) onManualAnswer("checked")
    })
    return
  }

  if (tag === "input" && type === "radio") {
    const radio = el as HTMLInputElement
    radio.addEventListener("change", () => {
      if (!radio.checked) return
      const value = labelFor(radio) || radio.value
      if (value) onManualAnswer(value)
    })
    return
  }

  // text / textarea - "blur" (not "input") so the prompt appears once the
  // user is done typing, not on every keystroke.
  const field = el as HTMLInputElement | HTMLTextAreaElement
  field.addEventListener("blur", () => {
    const value = field.value.trim()
    if (value) onManualAnswer(value)
  })
}

/** Resolves an `id`/`givenId` pair back to the live element it refers to. */
function resolveById(id?: string, givenId?: string): HTMLElement | null {
  if (id) {
    const byId = document.getElementById(id)
    if (byId) return byId
  }
  if (givenId) {
    const byAttr = document.querySelector<HTMLElement>(`[${TARGET_ATTR}="${CSS.escape(givenId)}"]`)
    if (byAttr) return byAttr
  }
  return null
}

/** Resolves an answer's own `id`/`givenId` back to the live element it refers to. */
function resolveTarget(answer: FieldAnswer): HTMLElement | null {
  return resolveById(answer.id, answer.givenId)
}

/** The LLM's answer is always a one-item array - this is the one item, if present. */
function firstAnswerDetail(answer: FieldAnswer): FieldAnswerDetail | undefined {
  return Array.isArray(answer.answer) ? answer.answer[0] : undefined
}

function isUncertain(detail: FieldAnswerDetail | undefined): boolean {
  if (!detail) return true
  if (detail.guessed === true) return true
  return typeof detail.confidence === "number" && detail.confidence < UNCERTAIN_CONFIDENCE
}

function keyFromLabel(label: string): string {
  const words = String(label || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
  if (words.length === 0) return "field"
  return words
    .map((word, index) => {
      const lower = word.toLowerCase()
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join("")
}

function readFieldValue(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const type = el.getAttribute("type")
  if (tag === "select") {
    const select = el as HTMLSelectElement
    const selected = select.options[select.selectedIndex]
    return selected?.textContent?.trim() || selected?.value || ""
  }
  if (tag === "input" && type === "checkbox") {
    return (el as HTMLInputElement).checked ? "Yes" : "No"
  }
  if (tag === "input" && type === "radio") {
    return labelFor(el) || (el as HTMLInputElement).value || ""
  }
  return ((el as HTMLInputElement | HTMLTextAreaElement).value || "").trim()
}

function clearField(el: HTMLElement): void {
  const tag = el.tagName.toLowerCase()
  const type = el.getAttribute("type")
  if (tag === "select") {
    const select = el as HTMLSelectElement
    select.selectedIndex = 0
    select.dispatchEvent(new Event("change", { bubbles: true }))
    return
  }
  if (tag === "input" && type === "checkbox") {
    const checkbox = el as HTMLInputElement
    if (checkbox.checked) checkbox.click()
    return
  }
  if (tag === "input" && type === "radio") {
    const radio = el as HTMLInputElement
    radio.checked = false
    radio.dispatchEvent(new Event("change", { bubbles: true }))
    return
  }
  const field = el as HTMLInputElement | HTMLTextAreaElement
  setNativeValue(field, "")
  field.dispatchEvent(new Event("input", { bubbles: true }))
  field.dispatchEvent(new Event("change", { bubbles: true }))
}

function promptUncertainFill(
  el: HTMLElement,
  label: string,
  action: FieldAction,
  detail: FieldAnswerDetail | undefined
): void {
  showUncertainPrompt(el, {
    getValue: () => readFieldValue(el) || detail?.value || "",
    onSave: (value) => saveDetailsField(label, value),
    onClear: () => clearField(el),
    onUndo: () => applyAnswer(el, action, detail?.value)
  })
}

/**
 * For `kind: "radio-group"`, the group itself has no single DOM element -
 * the chosen option (named by `detail.value`) is resolved via that
 * option's own `id`/`givenId` instead.
 */
function resolveRadioGroupTarget(
  answer: FieldAnswer,
  detail: FieldAnswerDetail | undefined
): HTMLElement | null {
  if (!Array.isArray(answer.options) || !detail?.value) return null
  const normalized = detail.value.trim().toLowerCase()
  const match = answer.options.find(
    (option) =>
      option.value.trim().toLowerCase() === normalized ||
      option.label.trim().toLowerCase() === normalized
  )
  return match ? resolveById(match.id, match.givenId) : null
}

// Sent when the user clicks "Save for later use" on a field the LLM had
// skipped - persisted server-side (keyed by the field's own label, not a
// portal-specific id) so a similarly-worded question on a future form gets
// answered from it instead of being skipped again.
function saveDetailsField(label: string, value: string): void {
  const trimmed = String(value ?? "").trim()
  if (!label.trim() || !trimmed) return
  sendMessageWithTimeout<SaveAnswerResult>({
    type: "SAVE_DETAILS",
    fields: [
      {
        label,
        key: keyFromLabel(label),
        answer: [{ value: trimmed }]
      }
    ]
  }).catch((err) => {
    console.error("[job-bot] failed to save details:", err)
  })
}

function saveAnswerForLater(label: string, value: string): void {
  saveDetailsField(label, value)
}

/**
 * Applies one action/value to the live DOM element it resolves to. Branches
 * on the element's REAL tag/type rather than trusting the LLM's claimed
 * action blindly - a safety net against the model picking an action that
 * doesn't match what the element actually is.
 */
function applyAnswer(el: HTMLElement, action: FieldAction, value: string | undefined): void {
  const tag = el.tagName.toLowerCase()
  const type = el.getAttribute("type")

  if (tag === "select") {
    if (action !== "select" || value === undefined) return
    const select = el as HTMLSelectElement
    // The LLM may echo back an option's value or its display text - match
    // against both instead of assuming one form.
    const normalized = value.trim().toLowerCase()
    const match = Array.from(select.options).find(
      (option) =>
        option.value.trim().toLowerCase() === normalized ||
        (option.textContent?.trim().toLowerCase() ?? "") === normalized
    )
    select.value = match ? match.value : value
    select.dispatchEvent(new Event("change", { bubbles: true }))
    return
  }

  if (tag === "input" && type === "checkbox") {
    const checkbox = el as HTMLInputElement
    const shouldCheck = action === "check" ? true : action === "uncheck" ? false : null
    if (shouldCheck === null || checkbox.checked === shouldCheck) return
    // A real click (rather than toggling `.checked` directly) fires the
    // same native input/change events a user interaction would.
    checkbox.click()
    return
  }

  if (tag === "input" && type === "radio") {
    // "check" on the one radio (resolved from the radio-group's chosen
    // option) the model wants selected. "uncheck" has no meaningful effect
    // on a radio - a group is only ever exclusive-select.
    if (action !== "check" && action !== "select") return
    const radio = el as HTMLInputElement
    if (!radio.checked) radio.click()
    return
  }

  // text / textarea
  if (action !== "type" || value === undefined) return
  const field = el as HTMLInputElement | HTMLTextAreaElement
  // Native setters bypass React's tracked value, so state stays in sync
  // once we dispatch the matching events below.
  setNativeValue(field, value)
  field.dispatchEvent(new Event("input", { bubbles: true }))
  field.dispatchEvent(new Event("change", { bubbles: true }))
}

/** Watches every radio in a skipped/unresolved group for a manual pick, offering to save whichever one the user checks. */
function watchRadioGroupForManualAnswer(answer: FieldAnswer, label: string): void {
  ;(answer.options || []).forEach((option) => {
    const el = resolveById(option.id, option.givenId)
    if (!el) return
    watchForManualAnswer(el, (value) => {
      showSavePrompt(el, label, () => saveAnswerForLater(label, value))
    })
  })
}

function fillFields(answers: FieldAnswer[]): void {
  if (!Array.isArray(answers) || answers.length === 0) {
    console.warn("[job-bot] fillFields called with empty/non-array answers:", answers)
    return
  }

  answers.forEach((answer) => {
    const key = answerKey(answer)
    if (appliedThisFill().has(key)) return
    appliedThisFill().add(key)

    const detail = firstAnswerDetail(answer)
    const label = answer.label || answer.id || answer.givenId || ""

    // Surfaced for debugging bad answers - a low-confidence/guessed answer
    // that turns out wrong is now easy to spot in the console instead of
    // silently looking like a normal fact-backed fill.
    if (isUncertain(detail)) {
      console.info("[job-bot] low-confidence/guessed answer:", { label, ...answer })
    }

    // "radio-group" has no single element of its own - resolve the chosen
    // option (or watch every option for a manual pick if skipped/unresolved)
    // instead of going through the shared single-element path below.
    if (answer.kind === "radio-group") {
      if (answer.action === "skip" || !detail?.value) {
        clearGeneratingOn(resolveById(answer.id, answer.givenId))
        clearGeneratingHighlights()
        watchRadioGroupForManualAnswer(answer, label)
        return
      }

      const el = resolveRadioGroupTarget(answer, detail)
      if (!el) {
        console.warn("[job-bot] could not resolve radio-group option for answer:", answer)
        return
      }

      try {
        applyAnswer(el, answer.action, detail.value)
        clearGeneratingOn(el)
        clearGeneratingHighlights()
        if (isUncertain(detail)) promptUncertainFill(el, label, answer.action, detail)
      } catch (err) {
        console.error("[job-bot] failed to fill radio-group, continuing:", answer, err)
      }
      return
    }

    const el = resolveTarget(answer)
    if (!el) {
      console.warn("[job-bot] could not resolve target element for answer:", answer)
      return
    }

    // The model's own read of the label is more reliable than re-deriving
    // it from the DOM (it saw the full question text in context) - fall
    // back to the DOM-derived label only if the model didn't provide one.
    const resolvedLabel =
      answer.label || labelFor(el) || el.getAttribute("name") || answer.id || answer.givenId || ""

    if (answer.action === "skip") {
      // No data was available for this field - watch for the user filling
      // it in by hand and offer to remember their answer for next time.
      clearGeneratingOn(el)
      watchForManualAnswer(el, (value) => {
        showSavePrompt(el, resolvedLabel, () => saveAnswerForLater(resolvedLabel, value))
      })
      return
    }

    // One field throwing (unexpected input state, a site's custom setter
    // rejecting the value, etc.) must never abort the whole batch.
    try {
      applyAnswer(el, answer.action, detail?.value)
      clearGeneratingOn(el)
      if (isUncertain(detail)) promptUncertainFill(el, resolvedLabel, answer.action, detail)
    } catch (err) {
      console.error("[job-bot] failed to fill field, continuing:", answer, err)
    }
  })
}

/**
 * Fallback adapter used when no site-specific adapter matches. Relies on
 * generic label/placeholder/name heuristics rather than portal-specific
 * selectors, so it degrades gracefully on unfamiliar sites.
 */
export const genericAdapter: SiteAdapter = {
  name: "generic",
  matches: () => true,
  tagFillableFields,
  beginFillSession,
  highlightTarget,
  fillFields
}
