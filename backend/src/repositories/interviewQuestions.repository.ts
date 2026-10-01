import { query } from "../database/pool";
import { findOrCreateTopic, findOrCreateConcept } from "./taxonomy.repository";

// Joins topic/concept names back in so callers still get plain strings
// instead of having to resolve topic_id/concept_id themselves.
const SELECT_WITH_NAMES = `
  SELECT iq.*, t.name AS topic, c.name AS concept
  FROM interview_questions iq
  LEFT JOIN topics t ON t.id = iq.topic_id
  LEFT JOIN concepts c ON c.id = iq.concept_id
`;

function mapRow(row) {
  return {
    id: row.id,
    interviewId: row.interview_id,
    orderIndex: row.order_index,
    questionText: row.question_text,
    topic: row.topic,
    concept: row.concept,
    answer: row.answer,
    score: row.score,
    feedback: row.feedback,
  };
}

export async function saveQuestions(interviewId, questions) {
  if (!questions.length) return [];

  const rows = [];
  for (const q of questions) {
    let topicId = null;
    let conceptId = null;
    if (q.topic) {
      const topic = await findOrCreateTopic(q.topic);
      topicId = topic.id;
      if (q.concept) {
        const concept = await findOrCreateConcept(topicId, q.concept);
        conceptId = concept.id;
      }
    }
    rows.push({ topicId, conceptId });
  }

  const values = [];
  const placeholders = questions
    .map((q, i) => {
      const base = i * 5;
      values.push(interviewId, i, q.question, rows[i].topicId, rows[i].conceptId);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    })
    .join(", ");

  const result = await query(
    `INSERT INTO interview_questions (interview_id, order_index, question_text, topic_id, concept_id)
     VALUES ${placeholders}
     RETURNING id`,
    values
  );

  const ids = result.rows.map((r) => r.id);
  const named = await query(`${SELECT_WITH_NAMES} WHERE iq.id = ANY($1::uuid[]) ORDER BY iq.order_index ASC`, [ids]);
  return named.rows.map(mapRow);
}

export async function getQuestionsForInterview(interviewId) {
  const result = await query(`${SELECT_WITH_NAMES} WHERE iq.interview_id = $1 ORDER BY iq.order_index ASC`, [
    interviewId,
  ]);
  return result.rows.map(mapRow);
}

// Persists per-question grading results (answer/score/feedback) produced by
// scoring.service.js after grading, matched back to questions by id.
export async function saveQuestionResults(results) {
  if (!Array.isArray(results) || !results.length) return [];

  const updated = [];
  for (const r of results) {
    if (!r || !r.questionId) continue;
    await query(
      `UPDATE interview_questions
       SET answer = $2, score = $3, feedback = $4
       WHERE id = $1`,
      [r.questionId, r.answer ?? null, r.score ?? null, r.feedback ?? null]
    );
    const named = await query(`${SELECT_WITH_NAMES} WHERE iq.id = $1`, [r.questionId]);
    if (named.rows[0]) updated.push(mapRow(named.rows[0]));
  }
  return updated;
}
