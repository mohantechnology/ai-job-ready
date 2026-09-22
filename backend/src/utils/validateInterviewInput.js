import { ApiError } from "../middleware/errorHandler.js";

const VALID_ROLES = ["junior", "mid", "senior"];
const VALID_TYPES = ["technical", "non-technical", "mix", "other"];
const VALID_ASSISTANCE_LEVELS = ["always", "on_request", "never"];
const DEFAULT_ASSISTANCE_LEVEL = "on_request";

const MAX_TOPICS = 20;
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 29;
const MAX_JOB_TITLE_LENGTH = 100;
const MAX_TYPE_OTHER_LENGTH = 100;
const MAX_RESUME_TEXT_LENGTH = 6000;
const MAX_ADDITIONAL_INFO_LENGTH = 8000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateInterviewInput(body = {}) {
  const {
    jobTitle,
    role,
    typeOfInterview,
    typeOfInterviewOther,
    topics,
    numberOfQuestions,
    resumeText,
    additionalInfo,
    assistanceLevel,
    appliedJobId,
  } = body;

  if (typeof jobTitle !== "string" || !jobTitle.trim()) {
    throw new ApiError(400, "jobTitle is required");
  }
  if (jobTitle.trim().length > MAX_JOB_TITLE_LENGTH) {
    throw new ApiError(400, `jobTitle must be at most ${MAX_JOB_TITLE_LENGTH} characters`);
  }

  if (!VALID_ROLES.includes(role)) {
    throw new ApiError(400, `role must be one of: ${VALID_ROLES.join(", ")}`);
  }

  if (!VALID_TYPES.includes(typeOfInterview)) {
    throw new ApiError(400, `typeOfInterview must be one of: ${VALID_TYPES.join(", ")}`);
  }

  let normalizedTypeOther = null;
  if (typeOfInterview === "other") {
    if (typeof typeOfInterviewOther !== "string" || !typeOfInterviewOther.trim()) {
      throw new ApiError(400, "typeOfInterviewOther is required when typeOfInterview is 'other'");
    }
    if (typeOfInterviewOther.trim().length > MAX_TYPE_OTHER_LENGTH) {
      throw new ApiError(400, `typeOfInterviewOther must be at most ${MAX_TYPE_OTHER_LENGTH} characters`);
    }
    normalizedTypeOther = typeOfInterviewOther.trim();
  }

  if (!Array.isArray(topics) || topics.length === 0 || !topics.every((t) => typeof t === "string" && t.trim())) {
    throw new ApiError(400, "topics must be a non-empty array of strings");
  }
  if (topics.length > MAX_TOPICS) {
    throw new ApiError(400, `topics must contain at most ${MAX_TOPICS} items`);
  }

  const numQuestions = Number(numberOfQuestions);
  if (!Number.isInteger(numQuestions) || numQuestions < MIN_QUESTIONS || numQuestions > MAX_QUESTIONS) {
    throw new ApiError(400, `numberOfQuestions must be an integer between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}`);
  }

  let normalizedResumeText = null;
  if (resumeText !== undefined && resumeText !== null && resumeText !== "") {
    if (typeof resumeText !== "string") {
      throw new ApiError(400, "resumeText must be a string");
    }
    if (resumeText.length > MAX_RESUME_TEXT_LENGTH) {
      throw new ApiError(400, `resumeText must be at most ${MAX_RESUME_TEXT_LENGTH} characters`);
    }
    normalizedResumeText = resumeText.trim() || null;
  }

  let normalizedAdditionalInfo = null;
  if (additionalInfo !== undefined && additionalInfo !== null && additionalInfo !== "") {
    if (typeof additionalInfo !== "string") {
      throw new ApiError(400, "additionalInfo must be a string");
    }
    if (additionalInfo.length > MAX_ADDITIONAL_INFO_LENGTH) {
      throw new ApiError(400, `additionalInfo must be at most ${MAX_ADDITIONAL_INFO_LENGTH} characters`);
    }
    normalizedAdditionalInfo = additionalInfo.trim() || null;
  }

  let normalizedAppliedJobId = null;
  if (appliedJobId != null && appliedJobId !== "") {
    if (typeof appliedJobId !== "string" || !UUID_RE.test(appliedJobId)) {
      throw new ApiError(400, "appliedJobId must be a uuid");
    }
    normalizedAppliedJobId = appliedJobId;
  }

  let normalizedAssistanceLevel = DEFAULT_ASSISTANCE_LEVEL;
  if (assistanceLevel !== undefined && assistanceLevel !== null && assistanceLevel !== "") {
    if (!VALID_ASSISTANCE_LEVELS.includes(assistanceLevel)) {
      throw new ApiError(400, `assistanceLevel must be one of: ${VALID_ASSISTANCE_LEVELS.join(", ")}`);
    }
    normalizedAssistanceLevel = assistanceLevel;
  }

  return {
    jobTitle: jobTitle.trim(),
    role,
    typeOfInterview,
    typeOfInterviewOther: normalizedTypeOther,
    topics: topics.map((t) => t.trim()),
    numberOfQuestions: numQuestions,
    resumeText: normalizedResumeText,
    additionalInfo: normalizedAdditionalInfo,
    assistanceLevel: normalizedAssistanceLevel,
    appliedJobId: normalizedAppliedJobId,
  };
}
