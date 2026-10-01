export const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

export type LlmProviderName = "openai" | "cursor";
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type LlmFeatureGroup = "interviews" | "applied_jobs" | "job_profile";

export type LlmFeatureDefinition = {
  key: string;
  name: string;
  description: string;
  group: LlmFeatureGroup;
  providers: LlmProviderName[];
  provider: LlmProviderName | "fromJobExtract" | "fromProfilePrefill";
  /** Literal model id, or a token resolved from the environment. */
  model: string;
  fastMode: boolean;
  maxTokens: number | null;
  maxTokensHint: string;
  promptNote: string;
};

const OPENAI_PROMPT_NOTE =
  "This replaces the system prompt. The page, resume, or transcript is still added by the app.";

export const LLM_FEATURES: LlmFeatureDefinition[] = [
  {
    key: "job_research",
    name: "Job research",
    description: "Writes a company and role brief for interview practice.",
    group: "interviews",
    providers: ["openai"],
    provider: "openai",
    model: "openaiChat",
    fastMode: false,
    maxTokens: null,
    maxTokensHint: "Blank uses 1200 for web search and 900 for the fallback",
    promptNote: "This replaces the research rules. The saved job and Wikipedia note are still added by the app.",
  },
  {
    key: "question_generation",
    name: "Question generation",
    description: "Builds the planned questions for a mock interview.",
    group: "interviews",
    providers: ["openai", "cursor"],
    provider: "openai",
    model: "openaiChat",
    fastMode: false,
    maxTokens: null,
    maxTokensHint: "Blank leaves the model limit unchanged",
    promptNote: OPENAI_PROMPT_NOTE,
  },
  {
    key: "interview_grading",
    name: "Interview grading",
    description: "Scores the transcript after a mock interview.",
    group: "interviews",
    providers: ["openai", "cursor"],
    provider: "openai",
    model: "openaiChat",
    fastMode: false,
    maxTokens: null,
    maxTokensHint: "Blank leaves the model limit unchanged",
    promptNote: OPENAI_PROMPT_NOTE,
  },
  {
    key: "realtime_interview",
    name: "Voice interview",
    description: "Live voice interviewer session.",
    group: "interviews",
    providers: ["openai"],
    provider: "openai",
    model: "openaiRealtime",
    fastMode: false,
    maxTokens: null,
    maxTokensHint: "Not sent to the voice session",
    promptNote:
      "Placeholders filled for each interview: {{roleLabel}}, {{typeLabel}}, {{positionLabel}}, {{topics}}, {{additionalInfoLine}}, {{assistanceInstruction}}, {{questionPlan}}, {{plannedQuestionToolLine}}, {{finalOrdinal}}, {{endInterviewTool}}. Empty lines are dropped.",
  },
  {
    key: "form_fill",
    name: "Form fill",
    description: "Fills a job application from the page and the candidate profile.",
    group: "applied_jobs",
    providers: ["openai", "cursor"],
    provider: "cursor",
    model: "formFill",
    fastMode: false,
    maxTokens: 20000,
    maxTokensHint: "Default 20000 on OpenAI. Cursor does not use this.",
    promptNote: "This replaces the system instructions. The candidate profile and page content are still added by the app.",
  },
  {
    key: "job_extract",
    name: "Job extract",
    description: "Reads a job posting page into company, role, and skills.",
    group: "applied_jobs",
    providers: ["openai", "cursor"],
    provider: "fromJobExtract",
    model: "matchProvider",
    fastMode: false,
    maxTokens: 2500,
    maxTokensHint: "Default 2500",
    promptNote: OPENAI_PROMPT_NOTE,
  },
  {
    key: "job_summary",
    name: "Job summary",
    description: "Compares a job posting with the candidate profile and resume.",
    group: "applied_jobs",
    providers: ["openai", "cursor"],
    provider: "fromJobExtract",
    model: "matchProvider",
    fastMode: false,
    maxTokens: 2200,
    maxTokensHint: "Default 2200",
    promptNote: OPENAI_PROMPT_NOTE,
  },
  {
    key: "resume_prefill",
    name: "Resume prefill",
    description: "Answers job-profile questions from an uploaded resume.",
    group: "job_profile",
    providers: ["openai", "cursor"],
    provider: "fromProfilePrefill",
    model: "matchProvider",
    fastMode: false,
    maxTokens: 8000,
    maxTokensHint: "Default 8000",
    promptNote: OPENAI_PROMPT_NOTE,
  },
];

export function findLlmFeature(key: string) {
  return LLM_FEATURES.find((feature) => feature.key === key) || null;
}
