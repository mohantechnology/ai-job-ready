import { ApiError } from "../middleware/errorHandler.js";
import { completeInterview, getInterview, setSummaryId } from "../store/interviewStore.js";
import { generateInterviewSummary } from "../services/scoring.service.js";
import { getQuestionsForInterview, saveQuestionResults } from "../repositories/interviewQuestions.repository.js";
import { createInterviewSummary } from "../repositories/interviewSummary.repository.js";

// This endpoint plays the role of the "webhook" in the interview flow.
// OpenAI cannot call our server directly for browser-based Realtime sessions,
// so the frontend (which is the party actually connected to OpenAI) reports
// the finished interview here once it ends.
export async function interviewCompleteHandler(req, res) {
  const { interviewId, transcript, endedReason } = req.body || {};

  if (!interviewId) {
    throw new ApiError(400, "interviewId is required");
  }

  const existing = await getInterview(interviewId, req.userId);
  if (!existing) {
    throw new ApiError(404, `Interview ${interviewId} not found`);
  }

  if (!Array.isArray(transcript)) {
    throw new ApiError(400, "transcript must be an array");
  }

  if (existing.status === "completed") {
    // Already graded (e.g. duplicate "end call" report) - avoid overwriting
    // the transcript/re-running grading, just return the existing state.
    const questions = await getQuestionsForInterview(interviewId);
    return res.json({ interview: existing, questions });
  }

  let interview = await completeInterview(interviewId, { transcript, endedReason });

  try {
    const questions = await getQuestionsForInterview(interviewId);
    const graded = await generateInterviewSummary(interview, questions);

    // Per-question score/answer/feedback live on interview_questions; the
    // aggregate grade lives in its own interview_summary row.
    await saveQuestionResults(graded.questionResults);
    const summaryRow = await createInterviewSummary(interviewId, graded);
    interview = await setSummaryId(interviewId, summaryRow.id);
  } catch (err) {
    // Grading is best-effort - never block the candidate from seeing the
    // transcript/results just because scoring failed.
    console.error(`Failed to generate summary for interview ${interviewId}:`, err);
  }

  res.json({ interview });
}
