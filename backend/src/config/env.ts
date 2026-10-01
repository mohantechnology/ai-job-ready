import dotenv from "dotenv";
import path from "path";

// dist/config -> backend/.env (same depth as the old src/config path).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const required = ["OPENAI_API_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[config] Missing required env var: ${key}. Set it in the root .env file.`);
  }
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const env = {
  port: Number(process.env.PORT) || 6102,
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiRealtimeModel: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini",
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  webhookUrl: process.env.WEBHOOK_URL || "http://localhost:6102/api/webhook/interview-complete",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:6101",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "job_ready_db",
  },
  jwtSecret: process.env.JWT_SECRET || "dev-insecure-jwt-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  sessionSecret: process.env.SESSION_SECRET || "dev-insecure-session-secret-change-me",
  cursorApiKey: process.env.CURSOR_API_KEY || "",
  cursorModel: process.env.CURSOR_MODEL || "composer-2.5",
  profilePrefillProvider: process.env.PROFILE_PREFILL_PROVIDER || "cursor",
  jobExtractProvider: process.env.JOB_EXTRACT_PROVIDER || "cursor",
  // Comma-separated emails treated as admin accounts until users.role exists.
  adminEmails: adminEmails(),
};
