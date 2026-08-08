import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { interviewCompleteHandler } from "../controllers/webhook.controller.js";

const router = Router();

// Matches WEBHOOK_URL in .env: http://localhost:3001/api/webhook/interview-complete
router.post("/interview-complete", requireAuth, asyncHandler(interviewCompleteHandler));

export default router;
