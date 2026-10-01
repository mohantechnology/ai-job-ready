import { Body, Controller, Get, HttpCode, Param, Patch, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiError } from "../../common/errors/api-error";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import {
  getAppliedJob,
  listAppliedJobs,
  updateAppliedJobStatus,
  upsertAppliedJob,
} from "../../repositories/appliedJob.repository";
import { saveQuestions } from "../../repositories/interviewQuestions.repository";
import { extractJobFromPage, normalizeSourceUrl, sourceKeyForUrl } from "../../services/jobExtract.service";
import { summarizeJobPage } from "../../services/jobSummary.service";
import { researchJobAndCompany } from "../../services/jobResearch.service";
import { generateInterviewQuestions } from "../../services/questionGeneration.service";
import { createInterview, getLatestResumeForUser } from "../../store/interviewStore";

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

@Controller("api/applied-jobs")
export class AppliedJobsController {
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const jobs = await listAppliedJobs(user.id);
    return { jobs };
  }

  @Post("summary")
  @HttpCode(200)
  async summarize(@CurrentUser() user: AuthUser, @Body() body: { pageHtml?: unknown; meta?: unknown }) {
    const { pageHtml, meta } = body || {};
    if (typeof pageHtml !== "string" || pageHtml.trim().length === 0) {
      throw new ApiError(400, "pageHtml is required");
    }
    if (meta != null && (typeof meta !== "object" || Array.isArray(meta))) {
      throw new ApiError(400, "meta must be an object");
    }

    try {
      return await summarizeJobPage({ pageHtml, meta, userId: user.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not summarize this page.";
      throw new ApiError(502, message);
    }
  }

  @Post()
  async save(
    @CurrentUser() user: AuthUser,
    @Body() body: { pageHtml?: unknown; meta?: any },
    @Res() res: Response
  ) {
    const { pageHtml, meta } = body || {};
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
      userId: user.id,
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

    const saved = await getAppliedJob(job.id, user.id);
    const interviews = (await listAppliedJobs(user.id)).find((item) => item.id === job.id)?.interviews || [];
    res.status(created ? 201 : 200).json({ job: { ...saved, interviews }, created });
  }

  @Patch(":id")
  async updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { status?: string }
  ) {
    const status = body?.status;
    if (!STATUSES.has(status)) {
      throw new ApiError(400, "status must be one of: applied, interviewed, offered, rejected");
    }
    const job = await updateAppliedJobStatus(id, user.id, status);
    if (!job) {
      throw new ApiError(404, "Applied job not found");
    }
    const interviews = (await listAppliedJobs(user.id)).find((item) => item.id === job.id)?.interviews || [];
    return { job: { ...job, interviews } };
  }

  @Post(":id/research")
  @HttpCode(200)
  async research(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const job = await getAppliedJob(id, user.id);
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

    return { additionalInfo: composePracticeAdditionalInfo(job, research) };
  }

  @Post(":id/interviews")
  @HttpCode(201)
  async createPractice(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { research?: boolean }
  ) {
    const job = await getAppliedJob(id, user.id);
    if (!job) {
      throw new ApiError(404, "Applied job not found");
    }

    const wantResearch = body?.research === true;
    let research = "";
    if (wantResearch) {
      try {
        research = await researchJobAndCompany(job);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not research this job.";
        throw new ApiError(502, message);
      }
    }

    const resumeText = await getLatestResumeForUser(user.id);
    const input = {
      userId: user.id,
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

    return { interview, questions };
  }
}
