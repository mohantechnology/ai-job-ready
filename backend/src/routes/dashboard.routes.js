import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getDashboardHandler } from "../controllers/dashboard.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/", asyncHandler(getDashboardHandler));

export default router;
