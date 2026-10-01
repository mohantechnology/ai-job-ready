import { Body, Controller, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiError } from "../../common/errors/api-error";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import {
  createInterview,
  getInterview,
  getLatestResumeForUser,
  listInterviews,
  markInProgress,
} from "../../store/interviewStore";
import { getQuestionsForInterview, saveQuestions } from "../../repositories/interviewQuestions.repository";
import {
  createWhiteboardSubmission,
  getWhiteboardSubmissionImage,
  listWhiteboardSubmissionsForInterview,
} from "../../repositories/whiteboardSubmissions.repository";
import { generateInterviewQuestions } from "../../services/questionGeneration.service";
import { getAppliedJob } from "../../repositories/appliedJob.repository";
import { validateInterviewInput } from "../../utils/validateInterviewInput";

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;

@Controller("api/interviews")
export class InterviewsController {
  @Post()
  @HttpCode(201)
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = validateInterviewInput(body);
    if (input.appliedJobId) {
      const job = await getAppliedJob(input.appliedJobId, user.id);
      if (!job) {
        throw new ApiError(404, "Applied job not found");
      }
    }
    const interview = await createInterview({ ...input, userId: user.id });

    let questions = [];
    try {
      const generated = await generateInterviewQuestions({ ...input, userId: user.id });
      questions = await saveQuestions(interview.id, generated);
    } catch (err) {
      console.error(`Failed to generate questions for interview ${interview.id}:`, err);
    }

    return { interview, questions };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const interviews = await listInterviews(user.id);
    return { interviews };
  }

  @Get("resume/latest")
  async latestResume(@CurrentUser() user: AuthUser) {
    const resumeText = await getLatestResumeForUser(user.id);
    return { resumeText };
  }

  @Get(":id")
  async getOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const interview = await getInterview(id, user.id);
    if (!interview) {
      throw new ApiError(404, `Interview ${id} not found`);
    }
    const questions = await getQuestionsForInterview(interview.id);
    const whiteboardSubmissions = await listWhiteboardSubmissionsForInterview(interview.id);
    return { interview, questions, whiteboardSubmissions };
  }

  @Post(":id/start")
  @HttpCode(200)
  async start(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const existing = await getInterview(id, user.id);
    if (!existing) {
      throw new ApiError(404, `Interview ${id} not found`);
    }
    if (existing.status === "completed") {
      throw new ApiError(409, "This interview has already been completed.");
    }
    const interview = await markInProgress(id);
    return { interview };
  }

  @Post(":id/whiteboard")
  @HttpCode(201)
  async createWhiteboard(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { imageDataUrl?: unknown; questionOrderIndex?: unknown }
  ) {
    const interview = await getInterview(id, user.id);
    if (!interview) {
      throw new ApiError(404, `Interview ${id} not found`);
    }

    const { imageDataUrl, questionOrderIndex } = body || {};
    const match = typeof imageDataUrl === "string" ? imageDataUrl.match(DATA_URL_PATTERN) : null;
    if (!match) {
      throw new ApiError(400, "imageDataUrl must be a base64 data URL (image/jpeg, image/png, or image/webp).");
    }

    const [, mimeType, base64] = match;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new ApiError(413, `Whiteboard image is too large (${Math.round(buffer.length / 1024)}KB). Max is 2.5MB.`);
    }

    const submission = await createWhiteboardSubmission({
      interviewId: interview.id,
      questionOrderIndex: Number.isInteger(questionOrderIndex) ? questionOrderIndex : 0,
      mimeType,
      buffer,
    });

    return { submission };
  }

  @Get(":id/whiteboard/:submissionId")
  async getWhiteboardImage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("submissionId") submissionId: string,
    @Res() res: Response
  ) {
    const interview = await getInterview(id, user.id);
    if (!interview) {
      throw new ApiError(404, `Interview ${id} not found`);
    }

    const image = await getWhiteboardSubmissionImage(submissionId, interview.id);
    if (!image) {
      throw new ApiError(404, "Whiteboard submission not found");
    }

    res.setHeader("Content-Type", image.mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(image.buffer);
  }
}
