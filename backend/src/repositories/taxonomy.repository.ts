import { query } from "../database/pool";

// Looks up a topic by name, creating it on the fly if it doesn't exist yet.
// There is no fixed enum of topics - whatever the question-generation LLM
// outputs becomes a row here the first time it's seen.
export async function findOrCreateTopic(name) {
  const result = await query(
    `INSERT INTO topics (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [name]
  );
  return result.rows[0];
}

// Same idea as findOrCreateTopic, but concepts are scoped to a topic
// (e.g. "event-loop" under "javascript") rather than globally unique.
export async function findOrCreateConcept(topicId, name) {
  const result = await query(
    `INSERT INTO concepts (topic_id, name)
     VALUES ($1, $2)
     ON CONFLICT (topic_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [topicId, name]
  );
  return result.rows[0];
}

// For a given user and set of topic names, returns one row per
// (topic, concept) the user has previously been asked about, with:
//   - lastScore: score from the most recent time it was asked
//   - timesAsked: total number of times it's been asked
//   - interviewsAgo: how many completed interviews ago it was last asked
//     (0 = most recent interview, 1 = one interview before that, ...)
// Only concepts that have actually been graded (score IS NOT NULL) are
// included, since ungraded questions don't tell us anything about mastery.
export async function getConceptStatsForUser(userId, topicNames) {
  if (!userId || !Array.isArray(topicNames) || !topicNames.length) return [];

  const result = await query(
    `WITH ranked_interviews AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) - 1 AS interviews_ago
       FROM interviews
       WHERE user_id = $1
     ),
     asked AS (
       SELECT
         t.name AS topic,
         c.name AS concept,
         iq.score,
         ri.interviews_ago
       FROM interview_questions iq
       JOIN ranked_interviews ri ON ri.id = iq.interview_id
       JOIN topics t ON t.id = iq.topic_id
       JOIN concepts c ON c.id = iq.concept_id
       WHERE iq.score IS NOT NULL
         AND t.name = ANY ($2::text[])
     )
     SELECT DISTINCT ON (topic, concept)
       topic,
       concept,
       score AS last_score,
       interviews_ago AS last_asked_interviews_ago,
       COUNT(*) OVER (PARTITION BY topic, concept) AS times_asked
     FROM asked
     ORDER BY topic, concept, interviews_ago ASC`,
    [userId, topicNames]
  );

  return result.rows.map((row) => ({
    topic: row.topic,
    concept: row.concept,
    lastScore: row.last_score,
    timesAsked: Number(row.times_asked),
    interviewsAgo: Number(row.last_asked_interviews_ago),
  }));
}
