import { query } from "../db/pool.js";

const JOB_COLUMNS = `
  id, user_id, source_url, page_title, company, role, level, location, work_mode,
  salary, topics, summary, description, status, created_at, updated_at
`;

function mapInterview(row) {
  return {
    id: row.interview_id,
    jobTitle: row.interview_job_title,
    status: row.interview_status,
    typeOfInterview: row.interview_type,
    numberOfQuestions: row.interview_questions,
    overallScore: row.interview_score,
    additionalInfo: row.interview_additional_info || null,
    createdAt: row.interview_created_at,
  };
}

function mapJob(row, interviews = []) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    sourceUrl: row.source_url,
    pageTitle: row.page_title,
    company: row.company,
    role: row.role,
    level: row.level,
    location: row.location,
    workMode: row.work_mode,
    salary: row.salary,
    topics: Array.isArray(row.topics) ? row.topics : [],
    summary: row.summary,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    interviews,
  };
}

export async function upsertAppliedJob({
  userId,
  sourceUrl,
  sourceKey,
  pageTitle,
  pageHtml,
  pageMeta,
  company,
  role,
  level,
  location,
  workMode,
  salary,
  topics,
  summary,
  description,
  extraction,
}) {
  const result = await query(
    `INSERT INTO applied_jobs (
       user_id, source_url, source_key, page_title, page_html, page_meta,
       company, role, level, location, work_mode, salary, topics,
       summary, description, extraction
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (user_id, source_key) DO UPDATE SET
       source_url = EXCLUDED.source_url,
       page_title = EXCLUDED.page_title,
       page_html = EXCLUDED.page_html,
       page_meta = EXCLUDED.page_meta,
       company = EXCLUDED.company,
       role = EXCLUDED.role,
       level = EXCLUDED.level,
       location = EXCLUDED.location,
       work_mode = EXCLUDED.work_mode,
       salary = EXCLUDED.salary,
       topics = EXCLUDED.topics,
       summary = EXCLUDED.summary,
       description = EXCLUDED.description,
       extraction = EXCLUDED.extraction
     RETURNING ${JOB_COLUMNS}, (xmax = 0) AS inserted`,
    [
      userId,
      sourceUrl,
      sourceKey,
      pageTitle || "",
      pageHtml || "",
      JSON.stringify(pageMeta || {}),
      company,
      role,
      level,
      location || "",
      workMode || "",
      salary || "",
      JSON.stringify(topics || []),
      summary || "",
      description || "",
      JSON.stringify(extraction || {}),
    ]
  );
  const row = result.rows[0];
  const created = row?.inserted === true || row?.inserted === "t";
  return { job: mapJob(row), created };
}

export async function listAppliedJobs(userId) {
  const jobsResult = await query(
    `SELECT ${JOB_COLUMNS}
     FROM applied_jobs
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  if (jobsResult.rows.length === 0) return [];

  const ids = jobsResult.rows.map((row) => row.id);
  const interviewsResult = await query(
    `SELECT
       i.applied_job_id,
       i.id AS interview_id,
       i.job_title AS interview_job_title,
       i.status AS interview_status,
       i.type_of_interview AS interview_type,
       i.number_of_questions AS interview_questions,
       i.additional_info AS interview_additional_info,
       i.created_at AS interview_created_at,
       s.overall_score AS interview_score
     FROM interviews i
     LEFT JOIN interview_summary s ON s.id = i.summary_id
     WHERE i.user_id = $1 AND i.applied_job_id = ANY($2::uuid[])
     ORDER BY i.created_at DESC`,
    [userId, ids]
  );

  const byJob = new Map();
  for (const row of interviewsResult.rows) {
    const list = byJob.get(row.applied_job_id) || [];
    list.push(mapInterview(row));
    byJob.set(row.applied_job_id, list);
  }

  return jobsResult.rows.map((row) => mapJob(row, byJob.get(row.id) || []));
}

export async function getAppliedJob(id, userId) {
  const result = await query(
    `SELECT ${JOB_COLUMNS}
     FROM applied_jobs
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return mapJob(result.rows[0]);
}

export async function updateAppliedJobStatus(id, userId, status) {
  const result = await query(
    `UPDATE applied_jobs
     SET status = $3
     WHERE id = $1 AND user_id = $2
     RETURNING ${JOB_COLUMNS}`,
    [id, userId, status]
  );
  return mapJob(result.rows[0]);
}
