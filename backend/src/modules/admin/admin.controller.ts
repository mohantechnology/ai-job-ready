import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AccountRole } from "../../common/auth/account-role";
import type { AuthUser } from "../../common/auth/auth-user";
import { ApiError } from "../../common/errors/api-error";
import { listProgressRanges, resolveProgressRange } from "../../utils/progressRanges";
import { findUserByEmail, findUserById } from "../../repositories/user.repository";
import { deleteAdminUser, getAdminStats, getAdminUserDetails, listAdminUsers, updateAdminUser } from "../../repositories/admin.repository";
import {
  getUsageByFeature,
  getUsageByModel,
  getUsageDaily,
  getUsageTotals,
  listUsageEvents,
  usageEventsCsv,
} from "../../repositories/llmUsage.repository";
import {
  createManagedApiKey,
  deleteManagedApiKey,
  listManagedApiKeys,
  listManagedModels,
  updateManagedModel,
} from "../../llm/llmConfigAdmin.service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUserId(id: string) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(400, "A valid user id is required");
  }
}

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

async function requireUser(id: string) {
  assertUserId(id);
  const existing = await findUserById(id);
  if (!existing) {
    throw new ApiError(404, "User not found");
  }
  return existing;
}

async function usagePayload(userId: string, query: Record<string, unknown>) {
  const { range, start, end } = resolveRange(query);
  const limit = pageNumber(query.limit, 25, 100) || 25;
  const offset = pageNumber(query.offset, 0, 100_000);
  const [totals, byModel, byFeature, daily, events] = await Promise.all([
    getUsageTotals(userId, start, end),
    getUsageByModel(userId, start, end),
    getUsageByFeature(userId, start, end),
    getUsageDaily(userId, start, end),
    listUsageEvents(userId, start, end, limit, offset, { includeApiKeyProvider: true }),
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

// Class-level role check applies to every handler on this controller.
@Controller("api/admin")
@Roles(AccountRole.Admin)
export class AdminController {
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return {
      user: {
        id: user.id,
        email: user.email ?? null,
        role: user.role,
      },
    };
  }

  @Get("stats")
  async stats() {
    return getAdminStats();
  }

  @Get("users")
  async users() {
    const users = await listAdminUsers();
    return { users };
  }

  @Get("users/:id/usage/export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async userUsageExport(@Param("id") id: string, @Query() query: Record<string, unknown>, @Res() res: Response) {
    await requireUser(id);
    const { start, end } = resolveRange(query);
    const csv = await usageEventsCsv(id, start, end, { includeApiKeyProvider: true });
    res.setHeader("Content-Disposition", 'attachment; filename="usage.csv"');
    res.send(csv);
  }

  @Get("users/:id/usage")
  async userUsage(@Param("id") id: string, @Query() query: Record<string, unknown>) {
    await requireUser(id);
    return usagePayload(id, query);
  }

  @Get("users/:id")
  async userDetails(@Param("id") id: string) {
    assertUserId(id);
    const details = await getAdminUserDetails(id);
    if (!details) {
      throw new ApiError(404, "User not found");
    }
    return details;
  }

  @Patch("users/:id")
  async updateUser(@CurrentUser() current: AuthUser, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    assertUserId(id);
    const existing = await findUserById(id);
    if (!existing) {
      throw new ApiError(404, "User not found");
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!name) {
      throw new ApiError(400, "Name is required");
    }
    if (name.length > 80) {
      throw new ApiError(400, "Name must be 80 characters or fewer");
    }
    if (!email || !EMAIL_RE.test(email)) {
      throw new ApiError(400, "A valid email is required");
    }
    if (current.id === id && email !== String(existing.email).toLowerCase()) {
      throw new ApiError(400, "You cannot change your own email");
    }
    if (email !== String(existing.email).toLowerCase()) {
      const taken = await findUserByEmail(email);
      if (taken && taken.id !== id) {
        throw new ApiError(409, "An account with this email already exists");
      }
    }

    const user = await updateAdminUser(id, { name, email });
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return { user };
  }

  @Delete("users/:id")
  async removeUser(@CurrentUser() current: AuthUser, @Param("id") id: string) {
    assertUserId(id);
    if (current.id === id) {
      throw new ApiError(400, "You cannot delete your own account");
    }
    const existing = await findUserById(id);
    if (!existing) {
      throw new ApiError(404, "User not found");
    }
    const deleted = await deleteAdminUser(id);
    if (!deleted) {
      throw new ApiError(404, "User not found");
    }
    return { ok: true };
  }

  @Get("api-keys")
  async apiKeys() {
    return listManagedApiKeys();
  }

  @Post("api-keys")
  async createApiKey(@Body() body: Record<string, unknown>) {
    return createManagedApiKey(body || {});
  }

  @Delete("api-keys/:id")
  async removeApiKey(@Param("id") id: string) {
    return deleteManagedApiKey(id);
  }

  @Get("models")
  async models() {
    return listManagedModels();
  }

  @Patch("models/:featureKey")
  async updateModel(@Param("featureKey") featureKey: string, @Body() body: Record<string, unknown>) {
    return updateManagedModel(featureKey, body || {});
  }
}
