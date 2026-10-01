import { Body, Controller, Get, Header, HttpCode, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiError } from "../../common/errors/api-error";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import { listProgressRanges, resolveProgressRange } from "../../utils/progressRanges";
import { recordRealtimeUsage } from "../../services/llmUsage.service";
import {
  getUsageByFeature,
  getUsageByModel,
  getUsageDaily,
  getUsageTotals,
  listUsageEvents,
  usageEventsCsv,
} from "../../repositories/llmUsage.repository";

function resolveRange(query: Record<string, unknown>) {
  try {
    const range = typeof query.range === "string" && query.range ? query.range : "this_month";
    return resolveProgressRange(range, new Date(), {
      from: typeof query.from === "string" ? query.from : undefined,
      to: typeof query.to === "string" ? query.to : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    throw new ApiError(400, message || `range must be one of: ${listProgressRanges().join(", ")}`);
  }
}

function pageNumber(value: unknown, fallback: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(Math.floor(number), max);
}

@Controller("api/usage")
export class UsageController {
  @Get()
  async get(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    const { range, start, end } = resolveRange(query);
    const limit = pageNumber(query.limit, 25, 100) || 25;
    const offset = pageNumber(query.offset, 0, 100_000);
    const userId = user.id;

    const [totals, byModel, byFeature, daily, events] = await Promise.all([
      getUsageTotals(userId, start, end),
      getUsageByModel(userId, start, end),
      getUsageByFeature(userId, start, end),
      getUsageDaily(userId, start, end),
      listUsageEvents(userId, start, end, limit, offset),
    ]);

    return {
      range,
      rangeStart: start ? start.toISOString() : null,
      rangeEnd: end ? end.toISOString() : null,
      totals,
      byModel,
      byFeature,
      daily,
      events,
      page: { limit, offset, total: totals.requests },
    };
  }

  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportCsv(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>, @Res() res: Response) {
    const { start, end } = resolveRange(query);
    const csv = await usageEventsCsv(user.id, start, end);
    res.setHeader("Content-Disposition", 'attachment; filename="usage.csv"');
    res.send(csv);
  }

  @Post("events")
  @HttpCode(201)
  recordEvent(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return recordRealtimeUsage(user.id, body);
  }
}
