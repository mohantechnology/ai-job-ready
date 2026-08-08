import { ApiError } from "./errorHandler.js";
import { verifyToken } from "../utils/jwt.js";

// Primary auth is a JWT sent as `Authorization: Bearer <token>`. As a
// fallback (e.g. if a request only carries the session cookie) we also
// accept a logged-in express-session, which is persisted in Postgres via
// connect-pg-simple so it survives a backend restart.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme === "Bearer" && token) {
    try {
      const payload = verifyToken(token);
      req.userId = payload.sub;
      return next();
    } catch {
      throw new ApiError(401, "Invalid or expired token");
    }
  }

  if (req.session?.userId) {
    req.userId = req.session.userId;
    return next();
  }

  throw new ApiError(401, "Authentication required");
}
