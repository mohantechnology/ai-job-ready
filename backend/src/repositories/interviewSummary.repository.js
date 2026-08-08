import { query } from "../db/pool.js";

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    interviewId: row.interview_id,
    overallScore: row.overall_score,
    overallFeedback: row.overall_feedback,
    strengths: row.strengths,
    improvements: row.improvements,
    topics: row.topics,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createInterviewSummary(
  interviewId,
  { overallScore, overallFeedback, strengths, improvements, topics }
) {
  const result = await query(
    `INSERT INTO interview_summary (interview_id, overall_score, overall_feedback, strengths, improvements, topics)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      interviewId,
      overallScore ?? null,
      overallFeedback ?? null,
      JSON.stringify(strengths || []),
      JSON.stringify(improvements || []),
      JSON.stringify(topics || []),
    ]
  );
  return mapRow(result.rows[0]);
}

export async function getInterviewSummaryById(id) {
  if (!id) return null;
  const result = await query(`SELECT * FROM interview_summary WHERE id = $1`, [id]);
  return mapRow(result.rows[0]);
}
