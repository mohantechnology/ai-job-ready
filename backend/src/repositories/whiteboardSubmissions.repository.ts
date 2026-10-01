import { query } from "../database/pool";

// image_data is intentionally excluded from list queries (metadata only) -
// callers fetch the actual bytes one at a time via getWhiteboardImageById,
// so listing an interview's submissions stays cheap even with many images.
function mapMetaRow(row) {
  return {
    id: row.id,
    interviewId: row.interview_id,
    questionOrderIndex: row.question_order_index,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export async function createWhiteboardSubmission({ interviewId, questionOrderIndex, mimeType, buffer }) {
  const result = await query(
    `INSERT INTO whiteboard_submissions (interview_id, question_order_index, mime_type, size_bytes, image_data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, interview_id, question_order_index, mime_type, size_bytes, created_at`,
    [interviewId, questionOrderIndex || 0, mimeType || "image/jpeg", buffer.length, buffer]
  );
  return mapMetaRow(result.rows[0]);
}

export async function listWhiteboardSubmissionsForInterview(interviewId) {
  const result = await query(
    `SELECT id, interview_id, question_order_index, mime_type, size_bytes, created_at
     FROM whiteboard_submissions
     WHERE interview_id = $1
     ORDER BY created_at ASC`,
    [interviewId]
  );
  return result.rows.map(mapMetaRow);
}

// Ownership is checked by the caller (interview lookup is user-scoped
// already); this just fetches the raw bytes for a submission that's known
// to belong to that interview.
export async function getWhiteboardSubmissionImage(id, interviewId) {
  const result = await query(
    `SELECT mime_type, image_data
     FROM whiteboard_submissions
     WHERE id = $1 AND interview_id = $2`,
    [id, interviewId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { mimeType: row.mime_type, buffer: row.image_data };
}
