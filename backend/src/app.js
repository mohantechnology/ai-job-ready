import express from "express";
import cors from "cors";
import morgan from "morgan";
import session from "express-session";
import pgSession from "connect-pg-simple";

import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import authRoutes from "./routes/auth.routes.js";
import interviewRoutes from "./routes/interview.routes.js";
import progressRoutes from "./routes/progress.routes.js";
import realtimeRoutes from "./routes/realtime.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PgSessionStore = pgSession(session);

app.use(cors({ origin: env.corsOrigin, credentials: true }));
// Default 100kb is too small for whiteboard image uploads (base64-encoded
// JPEG, compressed client-side to well under 2MB binary but ~33% larger
// once base64-encoded) - raised just enough to cover that with headroom.
app.use(express.json({ limit: "6mb" }));
app.use(morgan("dev"));

// Session data is persisted in the `session` Postgres table (see schema.sql)
// via connect-pg-simple, so logins survive a backend restart instead of
// living only in server memory. JWT (checked in requireAuth) remains the
// primary auth mechanism used by the frontend for API calls.
app.use(
  session({
    store: new PgSessionStore({ pool, tableName: "session", createTableIfMissing: false }),
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/webhook", webhookRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
