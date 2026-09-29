import { ApiError } from "../middleware/errorHandler.js";
import { resolveProgressRange, listProgressRanges } from "../utils/progressRanges.js";
import {
  getProgressSummary,
  getScoreTrend,
  getTopicProgress,
  getConceptProgress,
} from "../repositories/progress.repository.js";

export async function getProgressHandler(req, res) {
  let range;
  let start;
  let end;
  try {
    const requested = typeof req.query.range === "string" && req.query.range ? req.query.range : "this_week";
    ({ range, start, end } = resolveProgressRange(requested, new Date(), {
      from: req.query.from,
      to: req.query.to,
    }));
  } catch (err) {
    throw new ApiError(400, err.message || `range must be one of: ${listProgressRanges().join(", ")}`);
  }

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
