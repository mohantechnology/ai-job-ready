import type { FieldAnswer } from "~lib/messaging"

/**
 * A site adapter knows how to find fillable fields on one job portal (or a
 * generic fallback) and how to write a value back into a given field.
 * Adding support for a new portal (Greenhouse, Lever, Workday, LinkedIn...)
 * should mean writing one new adapter file, not touching messaging/background code.
 */
export type SiteAdapter = {
  /** Human-readable name, used for logging. */
  name: string
  /** Return true if this adapter should handle the current page. */
  matches: (hostname: string) => boolean
  /**
   * Scan the current document and tag every fillable element with a
   * durable identifier (native `id`, or an injected marker attribute) so
   * the LLM can read it straight out of the page HTML and later `fillFields`
   * calls can resolve the same element reliably. Returns how many fillable
   * elements were found.
   */
  tagFillableFields: () => number
  /** Clear the in-progress fill set so a new Autofill can write the same fields again. */
  beginFillSession?: () => void
  /** Pulse the field the model is currently generating an answer for. */
  highlightTarget?: (target: { id?: string; givenId?: string }) => void
  /** Apply the LLM's per-field answers to the matching DOM elements. */
  fillFields: (answers: FieldAnswer[]) => void
}
