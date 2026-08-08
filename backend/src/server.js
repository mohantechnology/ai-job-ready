import app from "./app.js";
import { env } from "./config/env.js";

app.listen(env.port, "0.0.0.0", () => {
  console.log(`Voice interviewer backend listening on http://localhost:${env.port}`);
});
