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
import {
  getJobPipeline,
  getJobsSavedInRange,
  getJobsWithoutPractice,
  getPracticeCoverage,
  getRecentApplications,
  getRecentCompletedInterviews,
  getStaleAppliedJobs,
  getUnfinishedInterviews,
} from "../../repositories/dashboard.repository";

function percent(part, total) {
  if (!total) return null;
  return Math.round((part / total) * 100);
}

function resolveRange(query: Record<string, unknown>) {
  try {
    const range = typeof query.range === "string" && query.range ? query.range : "this_week";
    return resolveProgressRange(range, new Date(), {
      from: typeof query.from === "string" ? query.from : undefined,
      to: typeof query.to === "string" ? query.to : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    throw new ApiError(400, message || `range must be one of: ${listProgressRanges().join(", ")}`);
  }
}

@Controller("api/dashboard")
export class DashboardController {
  @Get()
  async get(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    const { range, start, end } = resolveRange(query);
    const userId = user.id;

    const [
      pipeline,
      practice,
      jobsSaved,
      summary,
      scoreTrend,
      topics,
      concepts,
      unfinishedInterviews,
      jobsWithoutPractice,
      staleApplied,
      applications,
      interviews,
    ] = await Promise.all([
      getJobPipeline(userId),
      getPracticeCoverage(userId),
      getJobsSavedInRange(userId, start, end),
      getProgressSummary(userId, start, end),
      getScoreTrend(userId, start, end),
      getTopicProgress(userId, start, end),
      getConceptProgress(userId, start, end),
      getUnfinishedInterviews(userId),
      getJobsWithoutPractice(userId),
      getStaleAppliedJobs(userId),
      getRecentApplications(userId),
      getRecentCompletedInterviews(userId),
    ]);

    const weakest = topics.length ? [...topics].sort((a, b) => a.avgScore - b.avgScore)[0] : null;

    return {
      range,
      rangeStart: start ? start.toISOString() : null,
      rangeEnd: end ? end.toISOString() : null,
      jobs: {
        total: pipeline.total,
        byStatus: {
          applied: pipeline.applied,
          interviewed: pipeline.interviewed,
          offered: pipeline.offered,
          rejected: pipeline.rejected,
        },
        offerRate: percent(pipeline.offered, pipeline.total),
        rejectionRate: percent(pipeline.rejected, pipeline.total),
        jobsSaved,
        practice: {
          jobsWithPractice: practice.jobsWithPractice,
          total: practice.total,
          avgPracticeScore: practice.avgPracticeScore,
        },
      },
      summary,
      scoreTrend,
      topics,
      concepts,
      attention: {
        unfinishedInterviews,
        jobsWithoutPractice,
        staleApplied,
        weakestTopic: weakest ? { topic: weakest.topic, avgScore: weakest.avgScore } : null,
      },
      recent: {
        applications,
        interviews,
      },
    };
  }
}
