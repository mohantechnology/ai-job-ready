import { saveAdditionalAnswer, saveNewDetails } from "../repositories/userProfile.repository.js";

// Ported from job-bot/backend/src/routes/userRoutes.js as part of merging
// the job-bot extension's backend into this one.

function parseFieldsBody(body) {
  if (Array.isArray(body?.fields)) return body.fields;
  if (Array.isArray(body?.newDetails)) return body.newDetails;
  if (body && typeof body === "object" && (body.label || body.key)) return [body];
  return null;
}

// POST /api/user/save-details
// body: { fields: [{ label, key, answer: [{ value }] }] }
//        or a single { label, key, answer } object
// Confirmed/guessed answers from the extension land in `newDetails`.
export async function saveDetails(req, res) {
  const fields = parseFieldsBody(req.body || {});
  if (!fields) {
    return res.status(400).json({
      error: "`fields` must be an array of { label, key, answer } objects"
    });
  }

  try {
    const updated = await saveNewDetails(fields);
    res.json({ ok: true, newDetails: updated.newDetails });
  } catch (err) {
    console.error("jobbot user/save-details failed:", err);
    const message = err instanceof Error ? err.message : "Failed to save details";
    res.status(400).json({ error: message });
  }
}

// POST /api/user/save-answer
// body: { label: string, value: string }
// Older "Save for later" body - same persistence as /save-details.
export async function saveAnswer(req, res) {
  const { label, value } = req.body || {};

  if (typeof label !== "string" || typeof value !== "string" || !label.trim() || !value.trim()) {
    return res.status(400).json({ error: "`label` and `value` must be non-empty strings" });
  }

  try {
    await saveAdditionalAnswer(label, value);
    res.json({ ok: true });
  } catch (err) {
    console.error("jobbot user/save-answer failed:", err);
    res.status(500).json({ error: "Failed to save the answer" });
  }
}
