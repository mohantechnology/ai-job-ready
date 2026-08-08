import { ApiError } from "../middleware/errorHandler.js";
import { resolveProgressRange, isValidProgressRange, listProgressRanges } from "../utils/progressRanges.js";
import {
  getProgressSummary,
  getScoreTrend,
  getTopicProgress,
  getConceptProgress,
} from "../repositories/progress.repository.js";

export async function getProgressHandler(req, res) {
  const range = typeof req.query.range === "string" ? req.query.range : "this_week";

  if (!isValidProgressRange(range)) {
    throw new ApiError(400, `range must be one of: ${listProgressRanges().join(", ")}`);
  }

  const { start, end } = resolveProgressRange(range);

  const [summary, scoreTrend, topics, concepts] = await Promise.all([
    getProgressSummary(req.userId, start, end),
    getScoreTrend(req.userId, start, end),
    getTopicProgress(req.userId, start, end),
    getConceptProgress(req.userId, start, end),
  ]);

  res.json({
    range,
    rangeStart: start ? start.toISOString() : null,
    rangeEnd: end ? end.toISOString() : null,
    summary,
    scoreTrend,
    topics,
    concepts,
  });
}
