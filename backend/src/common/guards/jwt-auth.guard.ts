import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ApiError } from "../errors/api-error";
import { resolveAccountRole } from "../auth/account-role";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { verifyToken } from "../auth/jwt";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme === "Bearer" && token) {
      try {
        const payload = verifyToken(token) as { sub?: string; email?: string };
        if (!payload?.sub) {
          throw new ApiError(401, "Invalid or expired token");
        }
        req.user = {
          id: payload.sub,
          email: payload.email,
          role: resolveAccountRole(payload.email),
        };
        return true;
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(401, "Invalid or expired token");
      }
    }

    if (req.session?.userId) {
      req.user = {
        id: req.session.userId,
        email: req.session.email,
        role: resolveAccountRole(req.session.email),
      };
      return true;
    }

    throw new ApiError(401, "Authentication required");
  }
}
