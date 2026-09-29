import { ApiError } from "../middleware/errorHandler.js";
import { resolveProgressRange, listProgressRanges } from "../utils/progressRanges.js";
import {
  getProgressSummary,
  getScoreTrend,
  getTopicProgress,
  getConceptProgress,
} from "../repositories/progress.repository.js";
import {
  getJobPipeline,
  getPracticeCoverage,
  getJobsSavedInRange,
  getUnfinishedInterviews,
  getJobsWithoutPractice,
  getStaleAppliedJobs,
  getRecentApplications,
  getRecentCompletedInterviews,
} from "../repositories/dashboard.repository.js";

function percent(part, total) {
  if (!total) return null;
  return Math.round((part / total) * 100);
}

function resolveRange(query) {
  try {
    const range = typeof query.range === "string" && query.range ? query.range : "this_week";
    return resolveProgressRange(range, new Date(), { from: query.from, to: query.to });
  } catch (err) {
    throw new ApiError(400, err.message || `range must be one of: ${listProgressRanges().join(", ")}`);
  }
}

export async function getDashboardHandler(req, res) {
  const { range, start, end } = resolveRange(req.query);
  const userId = req.userId;

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

  const weakest = topics.length
    ? [...topics].sort((a, b) => a.avgScore - b.avgScore)[0]
    : null;

  res.json({
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
      weakestTopic: weakest
        ? { topic: weakest.topic, avgScore: weakest.avgScore }
        : null,
    },
    recent: {
      applications,
      interviews,
    },
  });
}
