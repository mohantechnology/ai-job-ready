import { INSTRUCTIONS } from "../prompts/jobbotFillForm";
import { SYSTEM_PROMPT as JOB_EXTRACT_PROMPT } from "../services/jobExtract.service";
import { SYSTEM_PROMPT as JOB_SUMMARY_PROMPT } from "../services/jobSummary.service";
import { SYSTEM_PROMPT as RESUME_PREFILL_PROMPT } from "../services/profileFromResume.service";
import { BRIEF_RULES } from "../services/jobResearch.service";
import { SYSTEM_PROMPT as QUESTION_PROMPT } from "../services/questionGeneration.service";
import { GRADING_SYSTEM_PROMPT } from "../services/scoring.service";
import { REALTIME_INSTRUCTION_TEMPLATE } from "../services/openaiRealtime.service";

const PROMPTS: Record<string, string> = {
  form_fill: INSTRUCTIONS,
  form_fill_cursor: INSTRUCTIONS,
  job_extract: JOB_EXTRACT_PROMPT,
  job_summary: JOB_SUMMARY_PROMPT,
  resume_prefill: RESUME_PREFILL_PROMPT,
  job_research: BRIEF_RULES,
  question_generation: QUESTION_PROMPT,
  interview_grading: GRADING_SYSTEM_PROMPT,
  realtime_interview: REALTIME_INSTRUCTION_TEMPLATE,
};

export function defaultPromptFor(featureKey: string) {
  return PROMPTS[featureKey] || "";
}
