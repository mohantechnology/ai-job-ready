import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  deleteCanonicalDetail,
  getUserDetails,
  saveAdditionalAnswer,
  saveCanonicalDetails,
  saveNewDetails,
} from "../repositories/userProfile.repository.js";
import { extractProfileFromResume } from "../services/profileFromResume.service.js";

const USER_DETAILS_SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../jsonData/userDetails.json"
);

// Ported from job-bot/backend/src/routes/userRoutes.js as part of merging
// the job-bot extension's backend into this one. Every handler reads/writes
// the profile row for `req.userId` (JWT `sub` / session user).

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
    const updated = await saveNewDetails(req.userId, fields);
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
    await saveAdditionalAnswer(req.userId, label, value);
    res.json({ ok: true });
  } catch (err) {
    console.error("jobbot user/save-answer failed:", err);
    res.status(500).json({ error: "Failed to save the answer" });
  }
}

// GET /api/user/profile-fields
// Field schema the Job profile screen uses to render first-time inputs.
export function getProfileFields(req, res) {
  try {
    const schema = JSON.parse(readFileSync(USER_DETAILS_SCHEMA_PATH, "utf8"));
    res.json({
      details: Array.isArray(schema?.details) ? schema.details : [],
      extraDetails: Array.isArray(schema?.extraDetails) ? schema.extraDetails : [],
    });
  } catch (err) {
    console.error("jobbot user/profile-fields GET failed:", err);
    res.status(500).json({ error: "Failed to load profile fields" });
  }
}

// GET /api/user/profile
// Powers the "Job profile" tab in the voice-bot frontend - returns the
// candidate's saved profile facts (each with one or more possible answers)
// plus the confirmed answers picked up from real job applications.
export async function getProfile(req, res) {
  try {
    const { details, newDetails } = await getUserDetails(req.userId);
    res.json({ details, newDetails });
  } catch (err) {
    console.error("jobbot user/profile GET failed:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
}

// PUT /api/user/profile
// body: { fields: [{ label, key, answer: [{ value }] }] }
//        or a single { label, key, answer } object
// Edits made on the "Job profile" screen update the canonical `details`
// list in place (unlike /save-details, which only logs confirmed answers).
export async function updateProfile(req, res) {
  const fields = parseFieldsBody(req.body || {});
  if (!fields) {
    return res.status(400).json({
      error: "`fields` must be an array of { label, key, answer } objects",
    });
  }

  try {
    const updated = await saveCanonicalDetails(req.userId, fields);
    res.json({ ok: true, details: updated.details });
  } catch (err) {
    console.error("jobbot user/profile PUT failed:", err);
    const message = err instanceof Error ? err.message : "Failed to update profile";
    res.status(400).json({ error: message });
  }
}

// POST /api/user/profile-from-resume
// body: { resumeText }
// Reads the resume with the chat model and returns form values for the
// profile questions. The caller reviews them before saving.
export async function prefillProfileFromResume(req, res) {
  const resumeText = typeof req.body?.resumeText === "string" ? req.body.resumeText.trim() : "";
  if (!resumeText) {
    return res.status(400).json({ error: { message: "Upload a resume before filling the form." } });
  }
  if (resumeText.length > 20000) {
    return res.status(400).json({ error: { message: "That resume is too long to read. Try a shorter PDF." } });
  }

  try {
    const result = await extractProfileFromResume(resumeText);
    res.json({ ok: true, values: result.values, filledCount: result.filledCount });
  } catch (err) {
    console.error("jobbot user/profile-from-resume failed:", err);
    const message = err instanceof Error ? err.message : "Failed to read the resume";
    const status = /not configured|not set/i.test(message) ? 503 : 502;
    res.status(status).json({ error: { message } });
  }
}

// DELETE /api/user/profile/:key
// Removes a single question/field from the canonical `details` list.
export async function deleteProfileField(req, res) {
  const { key } = req.params;

  try {
    const updated = await deleteCanonicalDetail(req.userId, key);
    res.json({ ok: true, details: updated.details });
  } catch (err) {
    console.error("jobbot user/profile DELETE failed:", err);
    const message = err instanceof Error ? err.message : "Failed to delete profile field";
    res.status(400).json({ error: message });
  }
}
