import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createPracticeInterviewHandler,
  listAppliedJobsHandler,
  researchAppliedJobHandler,
  saveAppliedJobHandler,
  summarizeJobPageHandler,
  updateAppliedJobStatusHandler,
} from "../controllers/appliedJob.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(listAppliedJobsHandler));
router.post("/summary", asyncHandler(summarizeJobPageHandler));
router.post("/", asyncHandler(saveAppliedJobHandler));
router.patch("/:id", asyncHandler(updateAppliedJobStatusHandler));
router.post("/:id/research", asyncHandler(researchAppliedJobHandler));
router.post("/:id/interviews", asyncHandler(createPracticeInterviewHandler));

export default router;
