import { query } from "../database/pool";

// Completed interviews for a user, optionally filtered to [start, end).
// Uses completed_at when set, otherwise created_at as a fallback.
function completedInterviewFilter(userId, start, end) {
  const params = [userId];
  const clauses = [`i.user_id = $1`, `i.status = 'completed'`];

  if (start) {
    params.push(start.toISOString());
    clauses.push(`COALESCE(i.completed_at, i.created_at) >= $${params.length}`);
  }
  if (end) {
    params.push(end.toISOString());
    clauses.push(`COALESCE(i.completed_at, i.created_at) < $${params.length}`);
  }

  return { where: clauses.join(" AND "), params };
}

export async function getProgressSummary(userId, start, end) {
  const { where, params } = completedInterviewFilter(userId, start, end);

  const result = await query(
    `SELECT
       COUNT(DISTINCT i.id)::int AS interviews_completed,
       ROUND(AVG(s.overall_score))::int AS avg_overall_score,
       COUNT(iq.id) FILTER (WHERE iq.score IS NOT NULL)::int AS questions_answered,
       COUNT(DISTINCT iq.topic_id) FILTER (WHERE iq.score IS NOT NULL)::int AS topics_practiced,
       COUNT(DISTINCT iq.concept_id) FILTER (WHERE iq.score IS NOT NULL)::int AS concepts_practiced
     FROM interviews i
     LEFT JOIN interview_summary s ON s.id = i.summary_id
     LEFT JOIN interview_questions iq ON iq.interview_id = i.id
     WHERE ${where}`,
    params
  );

  const row = result.rows[0] || {};
  return {
    interviewsCompleted: row.interviews_completed || 0,
    avgOverallScore: row.avg_overall_score ?? null,
    questionsAnswered: row.questions_answered || 0,
    topicsPracticed: row.topics_practiced || 0,
    conceptsPracticed: row.concepts_practiced || 0,
  };
}

// One point per calendar day that had at least one completed+graded interview.
export async function getScoreTrend(userId, start, end) {
  const { where, params } = completedInterviewFilter(userId, start, end);

  const result = await query(
    `SELECT
       DATE(COALESCE(i.completed_at, i.created_at)) AS day,
       ROUND(AVG(s.overall_score))::int AS avg_score,
       COUNT(DISTINCT i.id)::int AS interview_count
     FROM interviews i
     JOIN interview_summary s ON s.id = i.summary_id
     WHERE ${where}
       AND s.overall_score IS NOT NULL
     GROUP BY day
     ORDER BY day ASC`,
    params
  );

  return result.rows.map((row) => ({
    date: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
    avgScore: row.avg_score,
    interviewCount: row.interview_count,
  }));
}

export async function getTopicProgress(userId, start, end) {
  const { where, params } = completedInterviewFilter(userId, start, end);

  const result = await query(
    `SELECT
       t.name AS topic,
       ROUND(AVG(iq.score)::numeric, 1) AS avg_score,
       COUNT(iq.id)::int AS times_asked,
       COUNT(DISTINCT iq.concept_id)::int AS concepts_count,
       (ARRAY_AGG(iq.score ORDER BY COALESCE(i.completed_at, i.created_at) DESC))[1] AS last_score
     FROM interview_questions iq
     JOIN interviews i ON i.id = iq.interview_id
     JOIN topics t ON t.id = iq.topic_id
     WHERE ${where}
       AND iq.score IS NOT NULL
     GROUP BY t.name
     ORDER BY avg_score ASC, times_asked DESC`,
    params
  );

  return result.rows.map((row) => ({
    topic: row.topic,
    avgScore: Number(row.avg_score),
    timesAsked: row.times_asked,
    conceptsCount: row.concepts_count,
    lastScore: row.last_score,
  }));
}

export async function getConceptProgress(userId, start, end) {
  const { where, params } = completedInterviewFilter(userId, start, end);

  const result = await query(
    `SELECT
       t.name AS topic,
       c.name AS concept,
       ROUND(AVG(iq.score)::numeric, 1) AS avg_score,
       COUNT(iq.id)::int AS times_asked,
       (ARRAY_AGG(iq.score ORDER BY COALESCE(i.completed_at, i.created_at) DESC))[1] AS last_score
     FROM interview_questions iq
     JOIN interviews i ON i.id = iq.interview_id
     JOIN topics t ON t.id = iq.topic_id
     JOIN concepts c ON c.id = iq.concept_id
     WHERE ${where}
       AND iq.score IS NOT NULL
     GROUP BY t.name, c.name
     ORDER BY t.name ASC, avg_score ASC, times_asked DESC`,
    params
  );

  return result.rows.map((row) => ({
    topic: row.topic,
    concept: row.concept,
    avgScore: Number(row.avg_score),
    timesAsked: row.times_asked,
    lastScore: row.last_score,
  }));
}
