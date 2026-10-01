import { query } from "../database/pool";
import type { LlmProviderName } from "../llm/llmFeatures";

export type LlmSettingRow = {
  featureKey: string;
  displayName: string | null;
  provider: LlmProviderName | null;
  model: string | null;
  apiKey: string | null;
  systemPrompt: string | null;
  fastMode: boolean | null;
  reasoningEffort: string | null;
  maxTokens: number | null;
  updatedAt: string | null;
};

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapRow(row: any): LlmSettingRow {
  const maxTokens = row.max_tokens == null ? null : Number(row.max_tokens);
  return {
    featureKey: row.feature_key,
    displayName: textOrNull(row.display_name),
    provider: row.provider === "openai" || row.provider === "cursor" ? row.provider : null,
    model: textOrNull(row.model),
    apiKey: textOrNull(row.api_key),
    systemPrompt: typeof row.system_prompt === "string" && row.system_prompt.trim() ? row.system_prompt : null,
    fastMode: row.fast_mode == null ? null : Boolean(row.fast_mode),
    reasoningEffort: textOrNull(row.reasoning_effort),
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function listLlmSettings() {
  const result = await query(`SELECT * FROM llm_feature_settings`);
  return result.rows.map(mapRow);
}

export async function upsertLlmSetting(row: LlmSettingRow) {
  const result = await query(
    `INSERT INTO llm_feature_settings (
       feature_key, display_name, provider, model, api_key, system_prompt, fast_mode, reasoning_effort, max_tokens
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (feature_key) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       api_key = EXCLUDED.api_key,
       system_prompt = EXCLUDED.system_prompt,
       fast_mode = EXCLUDED.fast_mode,
       reasoning_effort = EXCLUDED.reasoning_effort,
       max_tokens = EXCLUDED.max_tokens,
       updated_at = now()
     RETURNING *`,
    [
      row.featureKey,
      row.displayName,
      row.provider,
      row.model,
      row.apiKey,
      row.systemPrompt,
      row.fastMode,
      row.reasoningEffort,
      row.maxTokens,
    ]
  );
  return mapRow(result.rows[0]);
}

export async function deleteLlmSetting(featureKey: string) {
  await query(`DELETE FROM llm_feature_settings WHERE feature_key = $1`, [featureKey]);
}
