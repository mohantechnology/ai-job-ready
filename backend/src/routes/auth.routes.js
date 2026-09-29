import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  updateAccountHandler,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", asyncHandler(registerHandler));
router.post("/login", asyncHandler(loginHandler));
router.post("/logout", logoutHandler);
router.get("/me", requireAuth, asyncHandler(meHandler));
router.patch("/account", requireAuth, asyncHandler(updateAccountHandler));

export default router;
