import { pool, query } from "../database/pool";
import { AccountRole, resolveAccountRole } from "../common/auth/account-role";
import {
  getJobPipeline,
  getPracticeCoverage,
  getRecentApplications,
  getRecentCompletedInterviews,
  getUnfinishedInterviews,
} from "./dashboard.repository";
import { getProgressSummary } from "./progress.repository";

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function count(value) {
  return Number(value) || 0;
}

export async function getAdminStats() {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM users) AS total_users,
       (SELECT COUNT(*)::int FROM users WHERE created_at >= now() - interval '7 days') AS new_users_7d,
       (SELECT COUNT(DISTINCT user_id)::int FROM (
          SELECT user_id FROM interviews
          WHERE created_at >= now() - interval '7 days'
             OR started_at >= now() - interval '7 days'
             OR completed_at >= now() - interval '7 days'
          UNION
          SELECT user_id FROM applied_jobs
          WHERE created_at >= now() - interval '7 days'
       ) active_7d) AS active_users_7d,
       (SELECT COUNT(DISTINCT user_id)::int FROM (
          SELECT user_id FROM interviews
          WHERE created_at >= now() - interval '30 days'
             OR started_at >= now() - interval '30 days'
             OR completed_at >= now() - interval '30 days'
          UNION
          SELECT user_id FROM applied_jobs
          WHERE created_at >= now() - interval '30 days'
       ) active_30d) AS active_users_30d,
       (SELECT COUNT(*)::int FROM interviews
        WHERE started_at IS NOT NULL OR status IN ('in_progress', 'completed')) AS interviews_started,
       (SELECT COUNT(*)::int FROM interviews WHERE status = 'completed') AS interviews_completed,
       (SELECT COUNT(*)::int FROM applied_jobs) AS applied_jobs`
  );
  const row = result.rows[0] || {};
  return {
    totalUsers: count(row.total_users),
    newUsers7d: count(row.new_users_7d),
    activeUsers7d: count(row.active_users_7d),
    activeUsers30d: count(row.active_users_30d),
    interviewsStarted: count(row.interviews_started),
    interviewsCompleted: count(row.interviews_completed),
    appliedJobs: count(row.applied_jobs),
  };
}

export async function listAdminUsers() {
  const result = await query(
    `SELECT
       u.id,
       u.name,
       u.email,
       u.created_at,
       COALESCE(i.interview_count, 0)::int AS interview_count,
       COALESCE(a.applied_job_count, 0)::int AS applied_job_count,
       GREATEST(i.last_activity, a.last_activity) AS last_activity
     FROM users u
     LEFT JOIN (
       SELECT
         user_id,
         COUNT(DISTINCT id)::int AS interview_count,
         MAX(ts) AS last_activity
       FROM (
         SELECT id, user_id, created_at AS ts FROM interviews
         UNION ALL
         SELECT id, user_id, started_at FROM interviews WHERE started_at IS NOT NULL
         UNION ALL
         SELECT id, user_id, completed_at FROM interviews WHERE completed_at IS NOT NULL
       ) events
       GROUP BY user_id
     ) i ON i.user_id = u.id
     LEFT JOIN (
       SELECT user_id, COUNT(*)::int AS applied_job_count, MAX(created_at) AS last_activity
       FROM applied_jobs
       GROUP BY user_id
     ) a ON a.user_id = u.id
     ORDER BY u.created_at DESC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: iso(row.created_at),
    isAdmin: resolveAccountRole(row.email) === AccountRole.Admin,
    interviewCount: count(row.interview_count),
    appliedJobCount: count(row.applied_job_count),
    lastActivityAt: iso(row.last_activity),
  }));
}

export async function updateAdminUser(id, updates: { name: string; email: string }) {
  const result = await query(
    `UPDATE users
     SET name = $2, email = $3, updated_at = now()
     WHERE id = $1
     RETURNING id, name, email, created_at`,
    [id, updates.name, updates.email]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: iso(row.created_at),
    isAdmin: resolveAccountRole(row.email) === AccountRole.Admin,
  };
}

function answerValues(details, key) {
  if (!Array.isArray(details)) return [];
  const field = details.find((item) => item && item.key === key);
  if (!field || field.answer == null) return [];
  const answers = Array.isArray(field.answer) ? field.answer : [field.answer];
  return answers
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item.value === "string") return item.value.trim();
      return "";
    })
    .filter(Boolean);
}

function firstAnswer(details, keys) {
  for (const key of keys) {
    const values = answerValues(details, key);
    if (values.length) return values;
  }
  return [];
}

function workItems(details) {
  if (!Array.isArray(details)) return [];
  const field = details.find((item) => item && item.key === "workExperience");
  return Array.isArray(field?.answer) ? field.answer : [];
}

function experienceLabel(value) {
  if (!value) return "";
  return /^\d+(\.\d+)?$/.test(value) ? `${value} years` : value;
}

function mapProfile(row) {
  if (!row) return null;
  const details = row.details;
  const jobs = workItems(details);
  const latestTitle = jobs.map((item) => item?.data?.jobTitle).find((title) => typeof title === "string" && title.trim());
  const skillValues = firstAnswer(details, ["skills"]);
  const skills = skillValues.length
    ? skillValues
    : [...new Set(jobs.flatMap((item) => (Array.isArray(item?.data?.skills) ? item.data.skills : []))
        .map((skill) => (typeof skill === "string" ? skill.trim() : ""))
        .filter(Boolean))];

  return {
    updatedAt: iso(row.updated_at),
    currentTitle: firstAnswer(details, ["currentTitle", "desiredPosition"])[0] || (latestTitle ? latestTitle.trim() : ""),
    location: answerValues(details, "location")[0] || "",
    yearsOfExperience: experienceLabel(firstAnswer(details, ["yearsOfExperience", "totalExperience"])[0] || ""),
    skills,
  };
}

export async function getAdminUserDetails(id) {
  const userResult = await query(
    `SELECT id, name, email, created_at, updated_at, last_login_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  const user = userResult.rows[0];
  if (!user) return null;

  const [activityResult, interviewResult, profileResult, pipeline, practice, summary, unfinished, applications, recentInterviews] =
    await Promise.all([
      query(
        `SELECT GREATEST(
           (
             SELECT MAX(ts) FROM (
               SELECT created_at AS ts FROM interviews WHERE user_id = $1
               UNION ALL
               SELECT started_at FROM interviews WHERE user_id = $1 AND started_at IS NOT NULL
               UNION ALL
               SELECT completed_at FROM interviews WHERE user_id = $1 AND completed_at IS NOT NULL
             ) events
           ),
           (SELECT MAX(created_at) FROM applied_jobs WHERE user_id = $1),
           (SELECT MAX(created_at) FROM llm_usage_events WHERE user_id = $1)
         ) AS last_activity`,
        [id]
      ),
      query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'created')::int AS created,
           COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
         FROM interviews
         WHERE user_id = $1`,
        [id]
      ),
      query(`SELECT details, updated_at FROM user_profile WHERE user_id = $1`, [id]),
      getJobPipeline(id),
      getPracticeCoverage(id),
      getProgressSummary(id, null, null),
      getUnfinishedInterviews(id),
      getRecentApplications(id),
      getRecentCompletedInterviews(id),
    ]);

  const interviews = interviewResult.rows[0] || {};
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: resolveAccountRole(user.email) === AccountRole.Admin,
      createdAt: iso(user.created_at),
      updatedAt: iso(user.updated_at),
      lastLoginAt: iso(user.last_login_at),
      lastActivityAt: iso(activityResult.rows[0]?.last_activity),
    },
    jobs: {
      total: pipeline.total,
      byStatus: {
        applied: pipeline.applied,
        interviewed: pipeline.interviewed,
        offered: pipeline.offered,
        rejected: pipeline.rejected,
      },
      practice: {
        jobsWithPractice: practice.jobsWithPractice,
        total: practice.total,
        avgPracticeScore: practice.avgPracticeScore,
      },
    },
    interviews: {
      total: count(interviews.total),
      created: count(interviews.created),
      inProgress: count(interviews.in_progress),
      completed: count(interviews.completed),
      avgOverallScore: summary.avgOverallScore,
      questionsAnswered: summary.questionsAnswered,
      topicsPracticed: summary.topicsPracticed,
      conceptsPracticed: summary.conceptsPracticed,
      unfinished,
    },
    recent: {
      applications,
      interviews: recentInterviews,
    },
    profile: mapProfile(profileResult.rows[0]),
  };
}

export async function deleteAdminUser(id) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE interviews SET summary_id = NULL WHERE user_id = $1`, [id]);
    const result = await client.query(`DELETE FROM users WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
