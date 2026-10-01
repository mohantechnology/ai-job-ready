import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import { getInterview, markInProgress } from "../../store/interviewStore";
import { getQuestionsForInterview } from "../../repositories/interviewQuestions.repository";
import { createEphemeralClientSecret } from "../../services/openaiRealtime.service";

@Controller("api/realtime")
export class RealtimeController {
  @Post("token")
  @HttpCode(200)
  async createToken(@CurrentUser() user: AuthUser, @Body() body: { interviewId?: string }) {
    const interviewId = body?.interviewId;

    if (!interviewId) {
      throw new ApiError(400, "interviewId is required");
    }

    const interview = await getInterview(interviewId, user.id);
    if (!interview) {
      throw new ApiError(404, `Interview ${interviewId} not found`);
    }
    if (interview.status === "completed") {
      throw new ApiError(409, "This interview has already been completed.");
    }

    const questions = await getQuestionsForInterview(interviewId);
    const clientSecret = await createEphemeralClientSecret(interview, questions);
    await markInProgress(interviewId);

    return { clientSecret };
  }
}
