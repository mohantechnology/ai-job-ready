import { Router } from "express";
import { fillWithOpenAI, fillWithCursor } from "../controllers/jobbotForm.controller.js";

// Ported from job-bot/backend/src/routes/formRoutes.js. Mounted at
// /api/form in app.js - /fill/cursor is the endpoint the job-bot browser
// extension actually calls.
const router = Router();

router.post("/fill", fillWithOpenAI);
router.post("/fill/cursor", fillWithCursor);

export default router;
