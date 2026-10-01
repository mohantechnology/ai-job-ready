import { pool, query } from "../database/pool";
import { AccountRole, resolveAccountRole } from "../common/auth/account-role";

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
       SELECT user_id, MAX(created_at) AS last_activity
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
