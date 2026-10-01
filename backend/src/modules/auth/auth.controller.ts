import { Body, Controller, Get, HttpCode, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import bcrypt from "bcryptjs";
import { ApiError } from "../../common/errors/api-error";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/auth/auth-user";
import { signToken } from "../../common/auth/jwt";
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserWithPasswordById,
  updateUserAccount,
} from "../../repositories/user.repository";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at || null,
  };
}

@Controller("api/auth")
export class AuthController {
  @Public()
  @Post("register")
  @HttpCode(201)
  async register(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const name = typeof body?.name === "string" ? body.name : "";
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name.trim()) {
      throw new ApiError(400, "Name is required");
    }
    if (!email || !EMAIL_RE.test(email)) {
      throw new ApiError(400, "A valid email is required");
    }
    if (!password || password.length < 6) {
      throw new ApiError(400, "Password must be at least 6 characters");
    }

    const existing = await findUserByEmail(email.toLowerCase());
    if (existing) {
      throw new ApiError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({ name: name.trim(), email: email.toLowerCase(), passwordHash });

    const token = signToken(user);
    req.session.userId = user.id;
    req.session.email = user.email;

    return { user: publicUser(user), token };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      throw new ApiError(400, "Email and password are required");
    }

    const user = await findUserByEmail(email.toLowerCase());
    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      throw new ApiError(401, "Invalid email or password");
    }

    const token = signToken(user);
    req.session.userId = user.id;
    req.session.email = user.email;

    return { user: publicUser(user), token };
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  logout(@Req() req: Request) {
    return new Promise((resolve) => {
      req.session.destroy(() => {
        resolve({ ok: true });
      });
    });
  }

  @Get("me")
  async me(@CurrentUser() current: AuthUser) {
    const user = await findUserById(current.id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return { user: publicUser(user) };
  }

  @Patch("account")
  async updateAccount(@CurrentUser() current: AuthUser, @Body() body: Record<string, unknown>) {
    const { name, email, currentPassword, newPassword } = body || {};

    if (email != null) {
      throw new ApiError(400, "Email cannot be changed");
    }

    const user = await findUserWithPasswordById(current.id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const next: { name?: string; passwordHash?: string } = {};

    if (name != null) {
      if (typeof name !== "string" || !name.trim()) {
        throw new ApiError(400, "Name is required");
      }
      if (name.trim().length > 80) {
        throw new ApiError(400, "Name must be 80 characters or fewer");
      }
      next.name = name.trim();
    }

    if (typeof newPassword === "string" && newPassword.length > 0) {
      if (newPassword.length < 6) {
        throw new ApiError(400, "Password must be at least 6 characters");
      }
      if (!currentPassword || typeof currentPassword !== "string") {
        throw new ApiError(400, "Current password is required");
      }
      const matches = await bcrypt.compare(currentPassword, user.password_hash);
      if (!matches) {
        throw new ApiError(400, "Current password is incorrect");
      }
      next.passwordHash = await bcrypt.hash(newPassword, 10);
    } else if (currentPassword) {
      throw new ApiError(400, "Enter a new password to update it");
    }

    if (next.name == null && next.passwordHash == null) {
      return { user: publicUser(user) };
    }

    const updated = await updateUserAccount(user.id, next);
    return { user: publicUser(updated) };
  }
}
