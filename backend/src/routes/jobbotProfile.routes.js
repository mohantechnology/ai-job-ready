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
// /api/user in app.js. The job-bot extension and the website Job profile
// tab both send a JWT; requireAuth resolves it to req.userId so each
// caller only reads/writes their own `user_profile` row.
const router = Router();

router.use(requireAuth);

router.post("/save-details", saveDetails);
router.post("/save-answer", saveAnswer);

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.delete("/profile/:key", deleteProfileField);

export default router;
