import { Router } from "express";
import { saveDetails, saveAnswer } from "../controllers/jobbotProfile.controller.js";

// Ported from job-bot/backend/src/routes/userRoutes.js. Mounted at
// /api/user in app.js - /save-details is the endpoint the job-bot browser
// extension actually calls; /save-answer is the older back-compat body shape.
const router = Router();

router.post("/save-details", saveDetails);
router.post("/save-answer", saveAnswer);

export default router;
