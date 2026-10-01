import type { AuthUser } from "../auth/auth-user";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    email?: string;
  }
}

export {};
