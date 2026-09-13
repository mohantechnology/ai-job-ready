import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  saveDetails,
  saveAnswer,
  getProfile,
  updateProfile,
  deleteProfileField,
} from "../controllers/jobbotProfile.controller.js";

// Ported from job-bot/backend/src/routes/userRoutes.js. Mounted at
// /api/user in app.js - /save-details is the endpoint the job-bot browser
// extension actually calls (no auth - the extension has no login); /save-answer
// is the older back-compat body shape.
const router = Router();

router.post("/save-details", saveDetails);
router.post("/save-answer", saveAnswer);

// /profile powers the "Job profile" tab in the voice-bot frontend, which is
// only reachable once signed in, so these are behind requireAuth (unlike the
// extension-facing routes above).
router.get("/profile", requireAuth, getProfile);
router.put("/profile", requireAuth, updateProfile);
router.delete("/profile/:key", requireAuth, deleteProfileField);

export default router;
