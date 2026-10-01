import { query } from "../database/pool";

const ATTENTION_LIMIT = 5;

function rangeParams(userId, start, end) {
  return [userId, start ? start.toISOString() : null, end ? end.toISOString() : null];
}

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getJobPipeline(userId) {
  const result = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'applied')::int AS applied,
       COUNT(*) FILTER (WHERE status = 'interviewed')::int AS interviewed,
       COUNT(*) FILTER (WHERE status = 'offered')::int AS offered,
       COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
     FROM applied_jobs
     WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0] || {};
  return {
    total: row.total || 0,
    applied: row.applied || 0,
    interviewed: row.interviewed || 0,
    offered: row.offered || 0,
    rejected: row.rejected || 0,
  };
}

export async function getPracticeCoverage(userId) {
  const result = await query(
    `SELECT
       COUNT(DISTINCT aj.id)::int AS total,
       COUNT(DISTINCT aj.id) FILTER (WHERE i.id IS NOT NULL)::int AS jobs_with_practice,
       ROUND(AVG(s.overall_score))::int AS avg_practice_score
     FROM applied_jobs aj
     LEFT JOIN interviews i ON i.applied_job_id = aj.id AND i.user_id = aj.user_id
     LEFT JOIN interview_summary s ON s.id = i.summary_id
     WHERE aj.user_id = $1`,
    [userId]
  );
  const row = result.rows[0] || {};
  return {
    total: row.total || 0,
    jobsWithPractice: row.jobs_with_practice || 0,
    avgPracticeScore: row.avg_practice_score ?? null,
  };
}

export async function getJobsSavedInRange(userId, start, end) {
  const result = await query(
    `SELECT COUNT(*)::int AS jobs_saved
     FROM applied_jobs
     WHERE user_id = $1
       AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)`,
    rangeParams(userId, start, end)
  );
  return result.rows[0]?.jobs_saved || 0;
}

async function attentionList(countSql, countParams, listSql, listParams, mapRow) {
  const [countResult, listResult] = await Promise.all([
    query(countSql, countParams),
    query(listSql, listParams),
  ]);
  return {
    count: countResult.rows[0]?.count || 0,
    items: listResult.rows.map(mapRow),
  };
}

export async function getUnfinishedInterviews(userId) {
  return attentionList(
    `SELECT COUNT(*)::int AS count
     FROM interviews
     WHERE user_id = $1 AND status IN ('created', 'in_progress')`,
    [userId],
    `SELECT id, job_title, status, created_at
     FROM interviews
     WHERE user_id = $1 AND status IN ('created', 'in_progress')
     ORDER BY created_at DESC
     LIMIT ${ATTENTION_LIMIT}`,
    [userId],
    (row) => ({
      id: row.id,
      jobTitle: row.job_title || "",
      status: row.status,
      createdAt: iso(row.created_at),
    })
  );
}

export async function getJobsWithoutPractice(userId) {
  const missing = `NOT EXISTS (
         SELECT 1 FROM interviews i
         WHERE i.applied_job_id = aj.id AND i.user_id = aj.user_id
       )`;
  return attentionList(
    `SELECT COUNT(*)::int AS count
     FROM applied_jobs aj
     WHERE aj.user_id = $1 AND ${missing}`,
    [userId],
    `SELECT aj.id, aj.company, aj.role, aj.created_at
     FROM applied_jobs aj
     WHERE aj.user_id = $1 AND ${missing}
     ORDER BY aj.created_at DESC
     LIMIT ${ATTENTION_LIMIT}`,
    [userId],
    (row) => ({
      id: row.id,
      company: row.company || "",
      role: row.role || "",
      createdAt: iso(row.created_at),
    })
  );
}

export async function getStaleAppliedJobs(userId) {
  const stale = `status = 'applied' AND created_at::date <= (CURRENT_DATE - 7)`;
  return attentionList(
    `SELECT COUNT(*)::int AS count
     FROM applied_jobs
     WHERE user_id = $1 AND ${stale}`,
    [userId],
    `SELECT id, company, role, created_at,
            (CURRENT_DATE - created_at::date)::int AS days_waiting
     FROM applied_jobs
     WHERE user_id = $1 AND ${stale}
     ORDER BY created_at ASC
     LIMIT ${ATTENTION_LIMIT}`,
    [userId],
    (row) => ({
      id: row.id,
      company: row.company || "",
      role: row.role || "",
      createdAt: iso(row.created_at),
      daysWaiting: row.days_waiting || 0,
    })
  );
}

export async function getRecentApplications(userId) {
  const result = await query(
    `SELECT id, company, role, status, created_at
     FROM applied_jobs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    company: row.company || "",
    role: row.role || "",
    status: row.status,
    createdAt: iso(row.created_at),
  }));
}

export async function getRecentCompletedInterviews(userId) {
  const result = await query(
    `SELECT
       i.id,
       i.job_title,
       s.overall_score,
       COALESCE(i.completed_at, i.created_at) AS completed_at
     FROM interviews i
     LEFT JOIN interview_summary s ON s.id = i.summary_id
     WHERE i.user_id = $1 AND i.status = 'completed'
     ORDER BY COALESCE(i.completed_at, i.created_at) DESC
     LIMIT 5`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    jobTitle: row.job_title || "",
    overallScore: row.overall_score ?? null,
    completedAt: iso(row.completed_at),
  }));
}
