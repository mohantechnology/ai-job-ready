import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import { completeInterview, getInterview, setSummaryId } from "../../store/interviewStore";
import { generateInterviewSummary } from "../../services/scoring.service";
import { getQuestionsForInterview, saveQuestionResults } from "../../repositories/interviewQuestions.repository";
import { createInterviewSummary } from "../../repositories/interviewSummary.repository";

@Controller("api/webhook")
export class WebhookController {
  @Post("interview-complete")
  @HttpCode(200)
  async interviewComplete(
    @CurrentUser() user: AuthUser,
    @Body() body: { interviewId?: string; transcript?: unknown; endedReason?: string }
  ) {
    const { interviewId, transcript, endedReason } = body || {};

    if (!interviewId) {
      throw new ApiError(400, "interviewId is required");
    }

    const existing = await getInterview(interviewId, user.id);
    if (!existing) {
      throw new ApiError(404, `Interview ${interviewId} not found`);
    }

    if (!Array.isArray(transcript)) {
      throw new ApiError(400, "transcript must be an array");
    }

    if (existing.status === "completed") {
      const questions = await getQuestionsForInterview(interviewId);
      return { interview: existing, questions };
    }

    let interview = await completeInterview(interviewId, { transcript, endedReason });

    try {
      const questions = await getQuestionsForInterview(interviewId);
      const graded = await generateInterviewSummary(interview, questions);
      await saveQuestionResults(graded.questionResults);
      const summaryRow = await createInterviewSummary(interviewId, graded);
      interview = await setSummaryId(interviewId, summaryRow.id);
    } catch (err) {
      console.error(`Failed to generate summary for interview ${interviewId}:`, err);
    }

    return { interview };
  }
}
