import { Pool } from "pg";
import { env } from "../config/env.js";

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle Postgres client:", err);
});

export function query(text, params) {
  return pool.query(text, params);
}
