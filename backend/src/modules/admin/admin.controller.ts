import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AccountRole } from "../../common/auth/account-role";
import type { AuthUser } from "../../common/auth/auth-user";
import { ApiError } from "../../common/errors/api-error";
import { findUserByEmail, findUserById } from "../../repositories/user.repository";
import { deleteAdminUser, getAdminStats, listAdminUsers, updateAdminUser } from "../../repositories/admin.repository";
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
