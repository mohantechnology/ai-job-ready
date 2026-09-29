export type PanelFrame = {
  x: number
  y: number
  width: number
  height: number
}

export type Viewport = {
  width: number
  height: number
}

export const PANEL_LAYOUT_KEY = "jobbot:panelLayout"
/** Bumped when the toolbar icon is clicked so the on-page panel opens. */
export const PANEL_REVEAL_KEY = "jobbot:panelReveal"

export const MIN_PANEL_WIDTH = 300
export const MIN_PANEL_HEIGHT = 380
const DEFAULT_WIDTH = 380
const DEFAULT_HEIGHT = 620
const SCREEN_MARGIN = 8
const EXPANDED_MARGIN = 40
const EXPANDED_MAX_WIDTH = 1120

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export function clampFrame(frame: PanelFrame, viewport: Viewport): PanelFrame {
  const maxWidth = Math.max(MIN_PANEL_WIDTH, viewport.width - SCREEN_MARGIN * 2)
  const maxHeight = Math.max(MIN_PANEL_HEIGHT, viewport.height - SCREEN_MARGIN * 2)
  const width = Math.min(Math.max(frame.width, MIN_PANEL_WIDTH), maxWidth)
  const height = Math.min(Math.max(frame.height, MIN_PANEL_HEIGHT), maxHeight)
  const maxX = Math.max(SCREEN_MARGIN, viewport.width - width - SCREEN_MARGIN)
  const maxY = Math.max(SCREEN_MARGIN, viewport.height - height - SCREEN_MARGIN)
  return {
    x: Math.min(Math.max(frame.x, SCREEN_MARGIN), maxX),
    y: Math.min(Math.max(frame.y, SCREEN_MARGIN), maxY),
    width,
    height
  }
}

export function defaultFrame(viewport: Viewport): PanelFrame {
  return clampFrame(
    {
      x: viewport.width - DEFAULT_WIDTH - 16,
      y: viewport.height - DEFAULT_HEIGHT - 16,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT
    },
    viewport
  )
}

/** Large reading size with a margin, short of covering the page. */
export function expandedFrame(viewport: Viewport): PanelFrame {
  const width = Math.min(viewport.width - EXPANDED_MARGIN * 2, EXPANDED_MAX_WIDTH)
  const height = Math.max(MIN_PANEL_HEIGHT, viewport.height - EXPANDED_MARGIN * 2)
  return clampFrame(
    {
      x: Math.round((viewport.width - width) / 2),
      y: EXPANDED_MARGIN,
      width,
      height
    },
    viewport
  )
}

export function moveFrame(start: PanelFrame, dx: number, dy: number): PanelFrame {
  return { ...start, x: start.x + dx, y: start.y + dy }
}

/** Resize from an edge, keeping the opposite edge fixed when the size hits a limit. */
export function applyResize(
  edge: ResizeEdge,
  start: PanelFrame,
  dx: number,
  dy: number,
  viewport: Viewport
): PanelFrame {
  const raw = resizeFrame(edge, start, dx, dy)
  const clamped = clampFrame(raw, viewport)
  let { x, y, width, height } = clamped
  if (edge.includes("w")) x = start.x + start.width - width
  else if (edge.includes("e")) x = start.x
  if (edge.includes("n")) y = start.y + start.height - height
  else if (edge.includes("s")) y = start.y
  return clampFrame({ x, y, width, height }, viewport)
}

export function resizeFrame(edge: ResizeEdge, start: PanelFrame, dx: number, dy: number): PanelFrame {
  let { x, y, width, height } = start
  if (edge.includes("e")) width = start.width + dx
  if (edge.includes("s")) height = start.height + dy
  if (edge.includes("w")) {
    width = start.width - dx
    x = start.x + dx
  }
  if (edge.includes("n")) {
    height = start.height - dy
    y = start.y + dy
  }
  return { x, y, width, height }
}

export function readStoredLayout(
  value: unknown,
  viewport: Viewport
): { frame: PanelFrame; expanded: boolean } | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const x = Number(raw.x)
  const y = Number(raw.y)
  const width = Number(raw.width)
  const height = Number(raw.height)
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null
  return {
    frame: clampFrame({ x, y, width, height }, viewport),
    expanded: raw.expanded === true
  }
}
