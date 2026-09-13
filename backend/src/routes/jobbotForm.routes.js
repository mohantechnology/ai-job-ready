import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { fillWithOpenAI, fillWithCursor } from "../controllers/jobbotForm.controller.js";

// Ported from job-bot/backend/src/routes/formRoutes.js. Mounted at
// /api/form in app.js - /fill/cursor is the endpoint the job-bot browser
// extension actually calls. Auth is required so we load that user's
// `user_profile` row rather than a shared global profile.
const router = Router();

router.post("/fill", requireAuth, fillWithOpenAI);
router.post("/fill/cursor", requireAuth, fillWithCursor);

export default router;
