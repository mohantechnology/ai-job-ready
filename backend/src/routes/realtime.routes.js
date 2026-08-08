import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { createRealtimeTokenHandler } from "../controllers/realtime.controller.js";

const router = Router();

// Mints a short-lived OpenAI ephemeral client secret for a given interview.
// The real OPENAI_API_KEY never leaves this server.
router.post("/token", requireAuth, asyncHandler(createRealtimeTokenHandler));

export default router;
