import type { FieldAction, FieldAnswer, FieldKind, FillStreamMessage } from "~lib/messaging"

const VALID_ACTIONS = new Set<FieldAction>(["type", "select", "check", "uncheck", "skip"])
const VALID_KINDS = new Set<FieldKind>(["text", "textarea", "select", "checkbox", "radio-group"])

/**
 * Pull every fully-closed object out of a (possibly truncated) JSON
 * `answers` array. The last still-open object is ignored until its
 * closing `}` arrives.
 */
export function extractRawAnswerObjects(raw: string): unknown[] {
  const key = raw.match(/"answers"\s*:\s*\[/)
  if (!key || key.index == null) return []

  const objects: unknown[] = []
  let depth = 0
  let objStart = -1
  let inString = false
  let escape = false

  for (let i = key.index + key[0].length; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === "\\") escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") {
      if (depth === 0) objStart = i
      depth += 1
    } else if (ch === "}") {
      depth -= 1
      if (depth === 0 && objStart !== -1) {
        try {
          objects.push(JSON.parse(raw.slice(objStart, i + 1)))
        } catch {
          // balanced but not valid JSON yet
        }
        objStart = -1
      }
    } else if (ch === "]" && depth === 0) {
      break
    }
  }

  return objects
}

function asGivenId(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value
  return undefined
}

export function normalizeStreamAnswer(raw: unknown): FieldAnswer | null {
  if (!raw || typeof raw !== "object") return null
  const answer = raw as Record<string, unknown>
  if (typeof answer.action !== "string" || !VALID_ACTIONS.has(answer.action as FieldAction)) {
    return null
  }

  const givenId = asGivenId(answer.given_id) || asGivenId(answer.givenId)
  const kind = typeof answer.kind === "string" && VALID_KINDS.has(answer.kind as FieldKind)
    ? (answer.kind as FieldKind)
    : undefined
  const hasTarget =
    typeof answer.id === "string" || Boolean(givenId) || kind === "radio-group"
  if (!hasTarget) return null

  const rawDetail = Array.isArray(answer.answer)
    ? answer.answer[0]
    : answer.answer && typeof answer.answer === "object"
      ? answer.answer
      : undefined
  const detail = rawDetail && typeof rawDetail === "object" ? (rawDetail as Record<string, unknown>) : undefined

  return {
    ...(typeof answer.id === "string" ? { id: answer.id } : {}),
    ...(givenId ? { givenId } : {}),
    ...(typeof answer.label === "string" ? { label: answer.label } : {}),
    ...(kind ? { kind } : {}),
    action: answer.action as FieldAction,
    ...(typeof answer.required === "boolean" ? { required: answer.required } : {}),
    ...(Array.isArray(answer.options)
      ? {
          options: answer.options
            .filter((opt) => opt && typeof opt === "object" && typeof (opt as { value?: unknown }).value === "string")
            .map((opt) => {
              const option = opt as Record<string, unknown>
              const optGivenId = asGivenId(option.given_id) || asGivenId(option.givenId)
              return {
                ...(typeof option.id === "string" ? { id: option.id } : {}),
                ...(optGivenId ? { givenId: optGivenId } : {}),
                label: String(option.label ?? option.value),
                value: String(option.value)
              }
            })
        }
      : {}),
    answer: detail
      ? [
          {
            confidence: typeof detail.confidence === "number" ? detail.confidence : 0,
            ...(typeof detail.value === "string" ? { value: detail.value } : {}),
            guessed: typeof detail.guessed === "boolean" ? detail.guessed : true
          }
        ]
      : [{ confidence: 0, guessed: true }]
  }
}

export function extractCompleteAnswers(raw: string): FieldAnswer[] {
  return extractRawAnswerObjects(raw)
    .map(normalizeStreamAnswer)
    .filter((answer): answer is FieldAnswer => Boolean(answer))
}

export type StreamTarget = {
  id?: string
  givenId?: string
}

function lastOpenAnswerSlice(raw: string): string | null {
  const key = raw.match(/"answers"\s*:\s*\[/)
  if (!key || key.index == null) return null

  let depth = 0
  let objStart = -1
  let inString = false
  let escape = false

  for (let i = key.index + key[0].length; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === "\\") escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") {
      if (depth === 0) objStart = i
      depth += 1
    } else if (ch === "}") {
      depth -= 1
      if (depth === 0) objStart = -1
    } else if (ch === "]" && depth === 0) {
      break
    }
  }

  return objStart !== -1 && depth > 0 ? raw.slice(objStart) : null
}

const TARGET_ID_RE = /"(id|given_id|givenId)"\s*:\s*"((?:\\.|[^"\\])*)"/g

/**
 * The in-progress `answers[]` object (not yet closed). As soon as a
 * complete `"id"` / `"given_id"` string is in that slice, we can highlight
 * the matching input.
 */
export function extractStreamingTarget(raw: string): StreamTarget | null {
  const slice = lastOpenAnswerSlice(raw)
  if (!slice) return null

  let id: string | undefined
  let givenId: string | undefined
  TARGET_ID_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TARGET_ID_RE.exec(slice))) {
    const value = match[2]
    if (!value) continue
    if (match[1] === "given_id" || match[1] === "givenId") {
      if (!givenId) givenId = value
    } else if (!id) {
      id = value
    }
  }

  if (!id && !givenId) return null
  return {
    ...(id ? { id } : {}),
    ...(givenId ? { givenId } : {})
  }
}

export function streamTargetKey(target: StreamTarget | null): string {
  if (!target) return ""
  return `${target.id || ""}|${target.givenId || ""}`
}

export function logFillStream(message: FillStreamMessage): void {
  switch (message.event) {
    case "start":
      console.log("[job-bot stream] start", message.provider || "")
      return
    case "delta":
      console.log("[job-bot stream]", message.text)
      return
    case "target":
      console.log("[job-bot stream] target", message.id || message.givenId || "")
      return
    case "answers":
      console.log("[job-bot stream] fill", message.answers)
      return
    case "done":
      console.log("[job-bot stream] done", message.timing || {}, message.answers)
      return
    case "error":
      console.error("[job-bot stream] error", message.error)
      return
  }
}
