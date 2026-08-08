import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getProgressHandler } from "../controllers/progress.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/", asyncHandler(getProgressHandler));

export default router;
