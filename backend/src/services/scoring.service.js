import { env } from "../config/env.js";

const CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

function formatTranscript(transcript) {
  return transcript
    .filter((entry) => entry.text && entry.text.trim())
    .map((entry) => `${entry.role === "assistant" ? "Interviewer" : "Candidate"}: ${entry.text.trim()}`)
    .join("\n");
}

function formatQuestionList(questions) {
  return questions.map((q) => `${q.id}: ${q.questionText}`).join("\n");
}

const GRADING_SYSTEM_PROMPT = [
  "You are an expert technical interview grader.",
  "You will be given the full transcript of a mock interview (interviewer questions and candidate answers), the",
  "role, interview type, and topics that were meant to be covered, and the list of planned questions that were",
  "asked, each with a unique questionId.",
  "For every planned question, find where it (or its closest match) was asked and answered in the transcript, then",
  "grade the candidate's answer to that specific question.",
  'Respond ONLY with a single JSON object, no prose, matching exactly this shape:',
  `{
  "overallScore": <integer 0-100>,
  "overallFeedback": "<2-4 sentence summary of overall performance>",
  "strengths": ["<short strength>", ...],
  "improvements": ["<short area to improve>", ...],
  "topics": [{ "topic": "<topic name>", "score": <integer 0-100>, "feedback": "<short feedback>" }],
  "questionResults": [{ "questionId": "<must exactly match one of the given questionIds>", "answer": "<candidate's answer text, or empty string if not answered>", "score": <integer 0-10>, "feedback": "<short feedback>" }]
}`,
  "Include exactly one entry in questionResults for every given questionId, in any order.",
  "If the transcript is empty or too short to grade, still return valid JSON with low scores and feedback explaining why.",
  "The user prompt may include an 'Assistance level' field describing how much help the interviewer was allowed to",
  "give the candidate during the interview ('always' = interviewer proactively corrects/explains wrong answers,",
  "'on_request' = interviewer only helps when explicitly asked, 'never' = interviewer never helps). Use this only as",
  "context for how much of the transcript is the interviewer's own explanation versus the candidate's independent",
  "answer - do not penalize the candidate for assistance the interviewer chose to give.",
].join("\n");

export async function generateInterviewSummary(interview, questions = []) {
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const transcriptText = formatTranscript(interview.transcript || []);
  const questionListText = formatQuestionList(questions);
  const effectiveType =
    interview.typeOfInterview === "other" ? interview.typeOfInterviewOther || "other" : interview.typeOfInterview;

  const userPrompt = [
    `Job title: ${interview.jobTitle}`,
    `Role: ${interview.role}`,
    `Interview type: ${effectiveType}`,
    `Topics: ${(interview.topics || []).join(", ")}`,
    `Planned number of questions: ${interview.numberOfQuestions}`,
    `Assistance level: ${interview.assistanceLevel || "on_request"}`,
    ...(interview.additionalInfo ? [`Additional info from candidate: ${interview.additionalInfo}`] : []),
    "",
    "Planned questions (questionId: question text):",
    questionListText || "(no planned questions)",
    "",
    "Transcript:",
    transcriptText || "(no transcript captured)",
  ].join("\n");

  const response = await fetch(CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.openaiChatModel,
      response_format: { type: "json_object" },
      // temperature: 0.2,
      messages: [
        { role: "system", content: GRADING_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to grade interview (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Grading response did not include content.");
  }

  const parsed = JSON.parse(content);
  return {
    overallScore: parsed.overallScore,
    overallFeedback: parsed.overallFeedback,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    questionResults: Array.isArray(parsed.questionResults) ? parsed.questionResults : [],
  };
}
