import { query } from "../database/pool";
import type { LlmProviderName } from "../llm/llmFeatures";

export type LlmSettingRow = {
  featureKey: string;
  displayName: string | null;
  provider: LlmProviderName | null;
  model: string | null;
  apiKeyId: string | null;
  systemPrompt: string | null;
  fastMode: boolean | null;
  reasoningEffort: string | null;
  maxTokens: number | null;
  updatedAt: string | null;
};

export type LlmApiKeyRow = {
  id: string;
  label: string;
  provider: LlmProviderName;
  apiKey: string;
  createdAt: string | null;
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
    apiKeyId: typeof row.api_key_id === "string" ? row.api_key_id : null,
    systemPrompt: typeof row.system_prompt === "string" && row.system_prompt.trim() ? row.system_prompt : null,
    fastMode: row.fast_mode == null ? null : Boolean(row.fast_mode),
    reasoningEffort: textOrNull(row.reasoning_effort),
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function mapApiKey(row: any): LlmApiKeyRow {
  return {
    id: row.id,
    label: textOrNull(row.label) || "API key",
    provider: row.provider === "cursor" ? "cursor" : "openai",
    apiKey: typeof row.api_key === "string" ? row.api_key : "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function legacyProvider(featureKey: string, provider: unknown): LlmProviderName {
  if (provider === "openai" || provider === "cursor") return provider;
  if (featureKey === "form_fill_cursor") return "cursor";
  return "openai";
}

/** Copies secrets that still sit on a feature row into llm_api_keys. */
export async function migrateInlineApiKeys() {
  const pending = await query(
    `SELECT feature_key, provider, btrim(api_key) AS api_key
     FROM llm_feature_settings
     WHERE api_key IS NOT NULL AND btrim(api_key) <> '' AND api_key_id IS NULL
     ORDER BY feature_key`
  );

  for (const row of pending.rows) {
    const provider = legacyProvider(row.feature_key, row.provider);
    const secret = String(row.api_key);
    const existing = await query(
      `SELECT id FROM llm_api_keys WHERE provider = $1 AND api_key = $2 LIMIT 1`,
      [provider, secret]
    );
    let keyId = existing.rows[0]?.id as string | undefined;
    if (!keyId) {
      const label = `Migrated ${row.feature_key}`.slice(0, 80);
      const inserted = await query(
        `INSERT INTO llm_api_keys (label, provider, api_key) VALUES ($1, $2, $3) RETURNING id`,
        [label, provider, secret]
      );
      keyId = inserted.rows[0].id;
    }
    await query(
      `UPDATE llm_feature_settings
       SET api_key_id = $1, api_key = NULL
       WHERE feature_key = $2 AND api_key_id IS NULL`,
      [keyId, row.feature_key]
    );
  }
}

export async function listLlmSettings() {
  const result = await query(`SELECT * FROM llm_feature_settings`);
  return result.rows.map(mapRow);
}

export async function upsertLlmSetting(row: LlmSettingRow) {
  const result = await query(
    `INSERT INTO llm_feature_settings (
       feature_key, display_name, provider, model, api_key_id, system_prompt, fast_mode, reasoning_effort, max_tokens
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (feature_key) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       api_key_id = EXCLUDED.api_key_id,
       api_key = NULL,
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
      row.apiKeyId,
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

export async function listLlmApiKeys() {
  const result = await query(`SELECT * FROM llm_api_keys ORDER BY label ASC, created_at ASC`);
  return result.rows.map(mapApiKey);
}

export async function insertLlmApiKey(input: { label: string; provider: LlmProviderName; apiKey: string }) {
  const result = await query(
    `INSERT INTO llm_api_keys (label, provider, api_key) VALUES ($1, $2, $3) RETURNING *`,
    [input.label, input.provider, input.apiKey]
  );
  return mapApiKey(result.rows[0]);
}

export async function deleteLlmApiKey(id: string) {
  const result = await query(`DELETE FROM llm_api_keys WHERE id = $1 RETURNING id`, [id]);
  return (result.rowCount ?? 0) > 0;
}
