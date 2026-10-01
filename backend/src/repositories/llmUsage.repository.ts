import { query } from "../database/pool";

const RANGE_SQL = `
  user_id = $1
  AND ($2::timestamptz IS NULL OR created_at >= $2)
  AND ($3::timestamptz IS NULL OR created_at < $3)
`;

function rangeArgs(userId, start, end) {
  return [userId, start ? start.toISOString() : null, end ? end.toISOString() : null];
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mapEvent(row) {
  return {
    id: row.id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    feature: row.feature,
    model: row.model,
    serviceTier: row.service_tier,
    status: row.status,
    inputTokens: row.input_tokens,
    cachedInputTokens: row.cached_input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    audioInputTokens: row.audio_input_tokens,
    audioOutputTokens: row.audio_output_tokens,
    totalTokens: row.total_tokens,
    durationMs: row.duration_ms,
    ttfbMs: row.ttfb_ms,
    errorMessage: row.error_message,
  };
}

export async function getUsageTotals(userId, start, end) {
  const result = await query(
    `SELECT
       COUNT(*)::int AS requests,
       COUNT(*) FILTER (WHERE status = 'success')::int AS succeeded,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
       COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
       COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
       COALESCE(SUM(cached_input_tokens), 0)::bigint AS cached_input_tokens,
       COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
       COALESCE(SUM(reasoning_tokens), 0)::bigint AS reasoning_tokens,
       COALESCE(SUM(audio_input_tokens), 0)::bigint AS audio_input_tokens,
       COALESCE(SUM(audio_output_tokens), 0)::bigint AS audio_output_tokens
     FROM llm_usage_events
     WHERE ${RANGE_SQL}`,
    rangeArgs(userId, start, end)
  );
  const row = result.rows[0] || {};
  return {
    requests: row.requests || 0,
    succeeded: row.succeeded || 0,
    failed: row.failed || 0,
    cancelled: row.cancelled || 0,
    totalTokens: asNumber(row.total_tokens),
    inputTokens: asNumber(row.input_tokens),
    cachedInputTokens: asNumber(row.cached_input_tokens),
    outputTokens: asNumber(row.output_tokens),
    reasoningTokens: asNumber(row.reasoning_tokens),
    audioInputTokens: asNumber(row.audio_input_tokens),
    audioOutputTokens: asNumber(row.audio_output_tokens),
  };
}

export async function getUsageByModel(userId, start, end) {
  const result = await query(
    `SELECT
       model,
       COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
       COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
       COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
       COUNT(*)::int AS requests
     FROM llm_usage_events
     WHERE ${RANGE_SQL}
     GROUP BY model
     ORDER BY SUM(total_tokens) DESC, model ASC`,
    rangeArgs(userId, start, end)
  );
  return result.rows.map((row) => ({
    model: row.model || "Unknown",
    totalTokens: asNumber(row.total_tokens),
    inputTokens: asNumber(row.input_tokens),
    outputTokens: asNumber(row.output_tokens),
    requests: row.requests || 0,
  }));
}

export async function getUsageByFeature(userId, start, end) {
  const result = await query(
    `SELECT
       feature,
       COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
       COUNT(*)::int AS requests
     FROM llm_usage_events
     WHERE ${RANGE_SQL}
     GROUP BY feature
     ORDER BY SUM(total_tokens) DESC, feature ASC`,
    rangeArgs(userId, start, end)
  );
  return result.rows.map((row) => ({
    feature: row.feature,
    totalTokens: asNumber(row.total_tokens),
    requests: row.requests || 0,
  }));
}

export async function getUsageDaily(userId, start, end) {
  const result = await query(
    `SELECT
       to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
       model,
       feature,
       COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens
     FROM llm_usage_events
     WHERE ${RANGE_SQL}
     GROUP BY 1, 2, 3
     ORDER BY 1 ASC`,
    rangeArgs(userId, start, end)
  );
  return result.rows.map((row) => ({
    date: row.day,
    model: row.model || "Unknown",
    feature: row.feature,
    totalTokens: asNumber(row.total_tokens),
  }));
}

export async function listUsageEvents(userId, start, end, limit, offset) {
  const params = [...rangeArgs(userId, start, end), limit, offset];
  const result = await query(
    `SELECT
       id, created_at, model, feature, status, service_tier,
       input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
       audio_input_tokens, audio_output_tokens, total_tokens,
       duration_ms, ttfb_ms, error_message
     FROM llm_usage_events
     WHERE ${RANGE_SQL}
     ORDER BY created_at DESC
     LIMIT $4 OFFSET $5`,
    params
  );
  return result.rows.map(mapEvent);
}

const CSV_HEADERS = [
  "Date (UTC)",
  "Feature",
  "Model",
  "Mode",
  "Input tokens",
  "Cache read tokens",
  "Output tokens",
  "Reasoning tokens",
  "Audio input tokens",
  "Audio output tokens",
  "Total tokens",
  "Status",
  "Duration ms",
  "Time to first token ms",
  "Error",
];

function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function modeLabel(serviceTier) {
  return String(serviceTier || "").toLowerCase() === "fast" ? "Fast" : "Standard";
}

export async function usageEventsCsv(userId, start, end) {
  const events = await listUsageEvents(userId, start, end, 10000, 0);
  const lines = [CSV_HEADERS.join(",")];
  for (const event of events) {
    lines.push(
      [
        event.createdAt,
        event.feature,
        event.model,
        modeLabel(event.serviceTier),
        event.inputTokens,
        event.cachedInputTokens,
        event.outputTokens,
        event.reasoningTokens,
        event.audioInputTokens,
        event.audioOutputTokens,
        event.totalTokens,
        event.status,
        event.durationMs ?? "",
        event.ttfbMs ?? "",
        event.errorMessage ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}
