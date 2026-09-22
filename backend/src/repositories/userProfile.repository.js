import { query } from "../db/pool.js";

// Postgres-backed replacement for job-bot/backend's flat-file
// `userService.js` (src/data/userdetails.json), merged into this backend.
// One row per authenticated account (`user_profile.user_id` → `users.id`).

// Sanity caps so one bad/huge extension request can't blow up a row with an
// absurd amount of data.
const MAX_KEY_LENGTH = 200;
const MAX_LABEL_LENGTH = 400;
const MAX_VALUE_LENGTH = 2000;
const MAX_NEW_DETAILS = 200;

function requireUserId(userId) {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("Authenticated user id is required");
  }
  return userId.trim();
}

/**
 * Reads the profile row fresh on every call (no in-memory cache) so
 * `save-details` calls are immediately visible to the next fill.
 * Missing rows return empty lists (the row is created on first write).
 * @param {string} userId
 * @returns {Promise<{details: object[], newDetails: object[]}>}
 */
export async function getUserDetails(userId) {
  const id = requireUserId(userId);
  try {
    const result = await query(
      `SELECT details, new_details FROM user_profile WHERE user_id = $1`,
      [id]
    );
    const row = result.rows[0];
    return {
      details: Array.isArray(row?.details) ? row.details : [],
      newDetails: Array.isArray(row?.new_details) ? row.new_details : []
    };
  } catch (err) {
    console.error("[jobbot] Failed to read user_profile:", err);
    return { details: [], newDetails: [] };
  }
}

function asTrimmedString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeLabel(label) {
  return asTrimmedString(label, MAX_LABEL_LENGTH).toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stable camelCase key from a form label, used when the client doesn't send one.
 * "Are you a US citizen?" -> "areYouAUsCitizen"
 */
export function keyFromLabel(label) {
  const words = asTrimmedString(label, MAX_LABEL_LENGTH)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (words.length === 0) return "";
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("")
    .slice(0, MAX_KEY_LENGTH);
}

function normalizeAnswerItems(rawAnswer) {
  const items = Array.isArray(rawAnswer) ? rawAnswer : rawAnswer != null ? [rawAnswer] : [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        const value = asTrimmedString(item, MAX_VALUE_LENGTH);
        return value ? { value } : null;
      }
      if (!item || typeof item !== "object") return null;
      const value =
        typeof item.value === "string"
          ? asTrimmedString(item.value, MAX_VALUE_LENGTH)
          : item.value != null
            ? asTrimmedString(String(item.value), MAX_VALUE_LENGTH)
            : "";
      if (!value) return null;
      const data =
        item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : null;
      return data ? { value, data } : { value };
    })
    .filter(Boolean);
}

/**
 * Coerce one incoming field into `{ label, key, answer: [{ value }] }`.
 * @returns {{label: string, key: string, answer: {value: string}[]}|null}
 */
export function normalizeDetailField(raw) {
  if (!raw || typeof raw !== "object") return null;

  const label = asTrimmedString(raw.label, MAX_LABEL_LENGTH);
  const answer = normalizeAnswerItems(raw.answer);
  if (!label || answer.length === 0) return null;

  const key = asTrimmedString(raw.key, MAX_KEY_LENGTH) || keyFromLabel(label);
  if (!key) return null;

  const group = asTrimmedString(raw.group, 80);
  return group ? { label, key, answer, group } : { label, key, answer };
}

function findExistingIndex(list, field) {
  const label = normalizeLabel(field.label);
  return list.findIndex((existing) => {
    if (!existing || typeof existing !== "object") return false;
    if (existing.key && existing.key === field.key) return true;
    return normalizeLabel(existing.label) === label;
  });
}

async function writeUserDetails(userId, details, newDetails) {
  const id = requireUserId(userId);
  await query(
    `INSERT INTO user_profile (user_id, details, new_details)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET details = EXCLUDED.details,
           new_details = EXCLUDED.new_details,
           updated_at = now()`,
    [id, JSON.stringify(details), JSON.stringify(newDetails)]
  );
  return { details, newDetails };
}

/**
 * Upserts confirmed form answers into `newDetails` (does not mutate `details`).
 * Match by `key`, then by normalized label, so saving the same question twice
 * updates the existing row instead of duplicating it.
 * @param {string} userId
 * @param {object[]} fields
 * @returns {Promise<{details: object[], newDetails: object[]}>}
 */
export async function saveNewDetails(userId, fields) {
  const incoming = (Array.isArray(fields) ? fields : [])
    .map(normalizeDetailField)
    .filter(Boolean);
  if (incoming.length === 0) {
    throw new Error("At least one field with `label` and a non-empty `answer` is required");
  }

  const { details, newDetails: existing } = await getUserDetails(userId);
  const newDetails = [...existing];

  for (const field of incoming) {
    const index = findExistingIndex(newDetails, field);
    if (index >= 0) {
      newDetails[index] = field;
    } else {
      newDetails.push(field);
    }
  }

  while (newDetails.length > MAX_NEW_DETAILS) {
    newDetails.shift();
  }

  return writeUserDetails(userId, details, newDetails);
}

/**
 * Back-compat wrapper for the old `{ label, value }` save-answer body.
 * @param {string} userId
 * @param {string} label
 * @param {string} value
 * @returns {Promise<{details: object[], newDetails: object[]}>}
 */
export async function saveAdditionalAnswer(userId, label, value) {
  return saveNewDetails(userId, [{ label, key: keyFromLabel(label), answer: [{ value }] }]);
}

/**
 * Upserts fields into the canonical `details` list (as opposed to
 * `saveNewDetails`, which only touches `newDetails`). This is what backs the
 * editable "Job profile" screen in the voice-bot frontend - edits made there
 * are meant to update the source-of-truth profile, not just log a confirmed
 * form answer.
 * Match by `key`, then by normalized label, so editing an existing question
 * updates it in place instead of duplicating it.
 * @param {string} userId
 * @param {object[]} fields
 * @returns {Promise<{details: object[], newDetails: object[]}>}
 */
export async function saveCanonicalDetails(userId, fields) {
  const incoming = (Array.isArray(fields) ? fields : [])
    .map(normalizeDetailField)
    .filter(Boolean);
  if (incoming.length === 0) {
    throw new Error("At least one field with `label` and a non-empty `answer` is required");
  }

  const { details: existing, newDetails } = await getUserDetails(userId);
  const details = [...existing];

  for (const field of incoming) {
    const index = findExistingIndex(details, field);
    if (index >= 0) {
      details[index] = {
        ...field,
        group: field.group || details[index].group,
      };
    } else {
      details.push(field);
    }
  }

  return writeUserDetails(userId, details, newDetails);
}

/**
 * Removes a single field (by `key`) from the canonical `details` list.
 * @param {string} userId
 * @param {string} key
 * @returns {Promise<{details: object[], newDetails: object[]}>}
 */
export async function deleteCanonicalDetail(userId, key) {
  const trimmedKey = asTrimmedString(key, MAX_KEY_LENGTH);
  if (!trimmedKey) {
    throw new Error("`key` is required");
  }

  const { details: existing, newDetails } = await getUserDetails(userId);
  const details = existing.filter((field) => field?.key !== trimmedKey);
  if (details.length === existing.length) {
    throw new Error(`No profile field found with key "${trimmedKey}"`);
  }

  return writeUserDetails(userId, details, newDetails);
}
