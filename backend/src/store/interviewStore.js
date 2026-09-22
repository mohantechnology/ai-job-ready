import { query } from "../db/pool.js";

export const INTERVIEW_STATUS = {
  CREATED: "created",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
};

// Selects interview columns plus its linked interview_summary row (if any),
// so callers get a ready-to-use nested `summary` object without a second query.
const SELECT_WITH_SUMMARY = `
  SELECT
    i.*,
    s.overall_score AS summary_overall_score,
    s.overall_feedback AS summary_overall_feedback,
    s.strengths AS summary_strengths,
    s.improvements AS summary_improvements,
    s.topics AS summary_topics
  FROM interviews i
  LEFT JOIN interview_summary s ON s.id = i.summary_id
`;

function mapRow(row) {
  if (!row) return null;
  const hasSummaryJoin = Object.prototype.hasOwnProperty.call(row, "summary_overall_score");

  return {
    id: row.id,
    userId: row.user_id,
    jobTitle: row.job_title,
    role: row.role,
    typeOfInterview: row.type_of_interview,
    typeOfInterviewOther: row.type_of_interview_other,
    topics: row.topics,
    numberOfQuestions: row.number_of_questions,
    resumeText: row.resume_text,
    additionalInfo: row.additional_info,
    assistanceLevel: row.assistance_level,
    status: row.status,
    endedReason: row.ended_reason,
    transcript: row.transcript,
    summaryId: row.summary_id,
    summary:
      hasSummaryJoin && row.summary_id
        ? {
            overallScore: row.summary_overall_score,
            overallFeedback: row.summary_overall_feedback,
            strengths: row.summary_strengths,
            improvements: row.summary_improvements,
            topics: row.summary_topics,
          }
        : null,
    appliedJobId: row.applied_job_id || null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export async function createInterview({
  userId,
  jobTitle,
  role,
  typeOfInterview,
  typeOfInterviewOther,
  topics,
  numberOfQuestions,
  resumeText,
  additionalInfo,
  assistanceLevel,
  appliedJobId,
}) {
  const result = await query(
    `INSERT INTO interviews (
       user_id, job_title, role, type_of_interview, type_of_interview_other,
       topics, number_of_questions, resume_text, additional_info, assistance_level,
       applied_job_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      userId,
      jobTitle,
      role,
      typeOfInterview,
      typeOfInterviewOther || null,
      JSON.stringify(topics),
      numberOfQuestions,
      resumeText || null,
      additionalInfo || null,
      assistanceLevel || "on_request",
      appliedJobId || null,
    ]
  );
  return mapRow(result.rows[0]);
}

export async function getInterview(id, userId) {
  const result = userId
    ? await query(`${SELECT_WITH_SUMMARY} WHERE i.id = $1 AND i.user_id = $2`, [id, userId])
    : await query(`${SELECT_WITH_SUMMARY} WHERE i.id = $1`, [id]);
  return mapRow(result.rows[0]);
}

export async function markInProgress(id) {
  const result = await query(
    `UPDATE interviews
     SET status = $2, started_at = COALESCE(started_at, now())
     WHERE id = $1
     RETURNING *`,
    [id, INTERVIEW_STATUS.IN_PROGRESS]
  );
  return mapRow(result.rows[0]);
}

export async function completeInterview(id, { transcript, endedReason }) {
  const result = await query(
    `UPDATE interviews
     SET status = $2, transcript = $3, ended_reason = $4, completed_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, INTERVIEW_STATUS.COMPLETED, JSON.stringify(transcript || []), endedReason || "unknown"]
  );
  return mapRow(result.rows[0]);
}

// Links an interview to its (already-created) interview_summary row.
export async function setSummaryId(id, summaryId) {
  await query(`UPDATE interviews SET summary_id = $2 WHERE id = $1`, [id, summaryId]);
  return getInterview(id);
}

export async function listInterviews(userId) {
  const result = await query(`${SELECT_WITH_SUMMARY} WHERE i.user_id = $1 ORDER BY i.created_at DESC`, [userId]);
  return result.rows.map(mapRow);
}

// Most recently used non-empty resume text for this user, so the setup wizard
// can offer "use your previous resume" / "change resume" instead of asking
// the candidate to re-upload it every time.
export async function getLatestResumeForUser(userId) {
  const result = await query(
    `SELECT resume_text
     FROM interviews
     WHERE user_id = $1 AND resume_text IS NOT NULL AND resume_text <> ''
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.resume_text || null;
}
