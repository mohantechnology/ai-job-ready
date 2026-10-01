import { Controller, Get, Query } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import { listProgressRanges, resolveProgressRange } from "../../utils/progressRanges";
import {
  getConceptProgress,
  getProgressSummary,
  getScoreTrend,
  getTopicProgress,
} from "../../repositories/progress.repository";

@Controller("api/progress")
export class ProgressController {
  @Get()
  async get(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    let range;
    let start;
    let end;
    try {
      const requested = typeof query.range === "string" && query.range ? query.range : "this_week";
      ({ range, start, end } = resolveProgressRange(requested, new Date(), {
        from: typeof query.from === "string" ? query.from : undefined,
        to: typeof query.to === "string" ? query.to : undefined,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      throw new ApiError(400, message || `range must be one of: ${listProgressRanges().join(", ")}`);
    }

    const [summary, scoreTrend, topics, concepts] = await Promise.all([
      getProgressSummary(user.id, start, end),
      getScoreTrend(user.id, start, end),
      getTopicProgress(user.id, start, end),
      getConceptProgress(user.id, start, end),
    ]);

    return {
      range,
      rangeStart: start ? start.toISOString() : null,
      rangeEnd: end ? end.toISOString() : null,
      summary,
      scoreTrend,
      topics,
      concepts,
    };
  }
}
