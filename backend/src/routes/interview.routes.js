import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createInterviewHandler,
  getInterviewHandler,
  startInterviewHandler,
  listInterviewsHandler,
  getLatestResumeHandler,
} from "../controllers/interview.controller.js";
import {
  createWhiteboardSubmissionHandler,
  getWhiteboardSubmissionImageHandler,
} from "../controllers/whiteboard.controller.js";

const router = Router();

router.use(requireAuth);

router.post("/", asyncHandler(createInterviewHandler));
router.get("/", asyncHandler(listInterviewsHandler));
router.get("/resume/latest", asyncHandler(getLatestResumeHandler));
router.get("/:id", asyncHandler(getInterviewHandler));
router.post("/:id/start", asyncHandler(startInterviewHandler));
router.post("/:id/whiteboard", asyncHandler(createWhiteboardSubmissionHandler));
router.get("/:id/whiteboard/:submissionId", asyncHandler(getWhiteboardSubmissionImageHandler));

export default router;
