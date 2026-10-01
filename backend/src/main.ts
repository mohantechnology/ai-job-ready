import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import morgan from "morgan";
import { AppModule } from "./app.module";
import { env } from "./config/env";
import { pool } from "./database/pool";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const PgSessionStore = connectPgSimple(session);

  // Whiteboard uploads and job-bot page HTML both exceed Express's 100kb default.
  app.use(json({ limit: "10mb" }));
  app.use(morgan("dev"));
  app.enableCors({ origin: true, credentials: true });

  // Session data lives in the `session` Postgres table. JWT remains the
  // primary auth mechanism the frontend sends on API calls.
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

  app.useGlobalFilters(new ApiExceptionFilter());

  await app.listen(env.port, "0.0.0.0");
  console.log(`Voice interviewer backend listening on http://localhost:${env.port}`);
}

bootstrap();
