import { ApiError } from "../middleware/errorHandler.js";
import {
  createInterview,
  getInterview,
  markInProgress,
  listInterviews,
  getLatestResumeForUser,
} from "../store/interviewStore.js";
import { saveQuestions, getQuestionsForInterview } from "../repositories/interviewQuestions.repository.js";
import { listWhiteboardSubmissionsForInterview } from "../repositories/whiteboardSubmissions.repository.js";
import { generateInterviewQuestions } from "../services/questionGeneration.service.js";
import { validateInterviewInput } from "../utils/validateInterviewInput.js";

export async function createInterviewHandler(req, res) {
  const input = validateInterviewInput(req.body);
  const interview = await createInterview({ ...input, userId: req.userId });

  // Best-effort: pre-generate the question list with an LLM so the realtime
  // interviewer asks a fixed, planned set of questions instead of improvising.
  // If this fails, the interview still exists and the interviewer instructions
  // fall back to generating questions on the fly (see openaiRealtime.service.js).
  let questions = [];
  try {
    const generated = await generateInterviewQuestions({ ...input, userId: req.userId });
    questions = await saveQuestions(interview.id, generated);
  } catch (err) {
    console.error(`Failed to generate questions for interview ${interview.id}:`, err);
  }

  res.status(201).json({ interview, questions });
}

export async function getLatestResumeHandler(req, res) {
  const resumeText = await getLatestResumeForUser(req.userId);
  res.json({ resumeText });
}

export async function listInterviewsHandler(req, res) {
  const interviews = await listInterviews(req.userId);
  res.json({ interviews });
}

export async function getInterviewHandler(req, res) {
  const interview = await getInterview(req.params.id, req.userId);
  if (!interview) {
    throw new ApiError(404, `Interview ${req.params.id} not found`);
  }
  const questions = await getQuestionsForInterview(interview.id);
  const whiteboardSubmissions = await listWhiteboardSubmissionsForInterview(interview.id);
  res.json({ interview, questions, whiteboardSubmissions });
}

export async function startInterviewHandler(req, res) {
  const existing = await getInterview(req.params.id, req.userId);
  if (!existing) {
    throw new ApiError(404, `Interview ${req.params.id} not found`);
  }
  if (existing.status === "completed") {
    throw new ApiError(409, "This interview has already been completed.");
  }
  const interview = await markInProgress(req.params.id);
  res.json({ interview });
}
