import { ApiError } from "../middleware/errorHandler.js";
import {
  getAppliedJob,
  listAppliedJobs,
  updateAppliedJobStatus,
  upsertAppliedJob,
} from "../repositories/appliedJob.repository.js";
import { saveQuestions } from "../repositories/interviewQuestions.repository.js";
import { extractJobFromPage, normalizeSourceUrl, sourceKeyForUrl } from "../services/jobExtract.service.js";
import { summarizeJobPage } from "../services/jobSummary.service.js";
import { researchJobAndCompany } from "../services/jobResearch.service.js";
import { generateInterviewQuestions } from "../services/questionGeneration.service.js";
import { createInterview, getLatestResumeForUser } from "../store/interviewStore.js";

const STATUSES = new Set(["applied", "interviewed", "offered", "rejected"]);
const PRACTICE_QUESTIONS = 5;
const MAX_ADDITIONAL_INFO = 8000;

function clip(value, max) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function interviewNotes(job) {
  const parts = [];
  if (job.company) parts.push(`Company: ${job.company}`);
  const where = [job.location, job.workMode].filter(Boolean).join(" · ");
  if (where) parts.push(`Location: ${where}`);
  if (job.salary) parts.push(`Salary: ${job.salary}`);
  if (job.summary) parts.push(job.summary);
  if (job.description) parts.push(job.description);
  return parts.join("\n\n");
}

function composePracticeAdditionalInfo(job, researchText) {
  const blocks = [];
  const research = clip(researchText, 4000);
  const notes = clip(interviewNotes(job), 3500);
  if (research) blocks.push(`Web research\n${research}`);
  if (notes) blocks.push(`Saved posting\n${notes}`);
  return clip(blocks.join("\n\n"), MAX_ADDITIONAL_INFO) || null;
}

export async function saveAppliedJobHandler(req, res) {
  const { pageHtml, meta } = req.body || {};
  if (typeof pageHtml !== "string" || pageHtml.trim().length === 0) {
    throw new ApiError(400, "pageHtml is required");
  }
  if (meta != null && (typeof meta !== "object" || Array.isArray(meta))) {
    throw new ApiError(400, "meta must be an object");
  }

  const sourceUrl = normalizeSourceUrl(meta?.url);
  if (!sourceUrl) {
    throw new ApiError(400, "This page has no URL to save.");
  }

  let extracted;
  try {
    extracted = await extractJobFromPage(pageHtml, { ...(meta || {}), url: sourceUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read this job page.";
    throw new ApiError(502, message);
  }

  const { job: fields, pageHtml: storedHtml } = extracted;
  const { job, created } = await upsertAppliedJob({
    userId: req.userId,
    sourceUrl,
    sourceKey: sourceKeyForUrl(sourceUrl),
    pageTitle: fields.pageTitle,
    pageHtml: storedHtml,
    pageMeta: fields.pageMeta,
    company: fields.company,
    role: fields.role,
    level: fields.level,
    location: fields.location,
    workMode: fields.workMode,
    salary: fields.salary,
    topics: fields.topics,
    summary: fields.summary,
    description: fields.description,
    extraction: {
      provider: extracted.provider,
      company: fields.company,
      role: fields.role,
      level: fields.level,
      location: fields.location,
      workMode: fields.workMode,
      salary: fields.salary,
      topics: fields.topics,
      summary: fields.summary,
    },
  });

  const saved = await getAppliedJob(job.id, req.userId);
  const interviews = (await listAppliedJobs(req.userId)).find((item) => item.id === job.id)?.interviews || [];
  res.status(created ? 201 : 200).json({ job: { ...saved, interviews }, created });
}

export async function summarizeJobPageHandler(req, res) {
  const { pageHtml, meta } = req.body || {};
  if (typeof pageHtml !== "string" || pageHtml.trim().length === 0) {
    throw new ApiError(400, "pageHtml is required");
  }
  if (meta != null && (typeof meta !== "object" || Array.isArray(meta))) {
    throw new ApiError(400, "meta must be an object");
  }

  let result;
  try {
    result = await summarizeJobPage({ pageHtml, meta, userId: req.userId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not summarize this page.";
    throw new ApiError(502, message);
  }

  res.json(result);
}

export async function listAppliedJobsHandler(req, res) {
  const jobs = await listAppliedJobs(req.userId);
  res.json({ jobs });
}

export async function updateAppliedJobStatusHandler(req, res) {
  const status = req.body?.status;
  if (!STATUSES.has(status)) {
    throw new ApiError(400, "status must be one of: applied, interviewed, offered, rejected");
  }
  const job = await updateAppliedJobStatus(req.params.id, req.userId, status);
  if (!job) {
    throw new ApiError(404, "Applied job not found");
  }
  const interviews = (await listAppliedJobs(req.userId)).find((item) => item.id === job.id)?.interviews || [];
  res.json({ job: { ...job, interviews } });
}

export async function researchAppliedJobHandler(req, res) {
  const job = await getAppliedJob(req.params.id, req.userId);
  if (!job) {
    throw new ApiError(404, "Applied job not found");
  }

  let research = "";
  try {
    research = await researchJobAndCompany(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not research this job.";
    throw new ApiError(502, message);
  }

  res.json({ additionalInfo: composePracticeAdditionalInfo(job, research) });
}

export async function createPracticeInterviewHandler(req, res) {
  const job = await getAppliedJob(req.params.id, req.userId);
  if (!job) {
    throw new ApiError(404, "Applied job not found");
  }

  const wantResearch = req.body?.research === true;
  let research = "";
  if (wantResearch) {
    try {
      research = await researchJobAndCompany(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not research this job.";
      throw new ApiError(502, message);
    }
  }

  const resumeText = await getLatestResumeForUser(req.userId);
  const input = {
    userId: req.userId,
    jobTitle: job.role || "Untitled role",
    role: job.level || "mid",
    typeOfInterview: "mix",
    typeOfInterviewOther: null,
    topics: job.topics?.length ? job.topics : ["General"],
    numberOfQuestions: PRACTICE_QUESTIONS,
    resumeText,
    additionalInfo: composePracticeAdditionalInfo(job, research),
    assistanceLevel: "on_request",
    appliedJobId: job.id,
  };

  const interview = await createInterview(input);

  let questions = [];
  try {
    const generated = await generateInterviewQuestions(input);
    questions = await saveQuestions(interview.id, generated);
  } catch (err) {
    console.error(`Failed to generate questions for interview ${interview.id}:`, err);
  }

  res.status(201).json({ interview, questions });
}
