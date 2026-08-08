import { ApiError } from "../middleware/errorHandler.js";
import { getInterview, markInProgress } from "../store/interviewStore.js";
import { getQuestionsForInterview } from "../repositories/interviewQuestions.repository.js";
import { createEphemeralClientSecret } from "../services/openaiRealtime.service.js";

export async function createRealtimeTokenHandler(req, res) {
  const { interviewId } = req.body || {};

  if (!interviewId) {
    throw new ApiError(400, "interviewId is required");
  }

  const interview = await getInterview(interviewId, req.userId);
  if (!interview) {
    throw new ApiError(404, `Interview ${interviewId} not found`);
  }
  if (interview.status === "completed") {
    // Guards against a stale "back"/reload landing on the interview page for
    // an interview that's already finished, which would otherwise flip its
    // status back to in_progress and let the candidate re-take it.
    throw new ApiError(409, "This interview has already been completed.");
  }

  const questions = await getQuestionsForInterview(interviewId);
  const clientSecret = await createEphemeralClientSecret(interview, questions);
  await markInProgress(interviewId);

  res.json({ clientSecret });
}
