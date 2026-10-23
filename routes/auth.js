import express from "express";
import { getMe, login, register } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../utility/rateLimit.js";

const router = express.Router();

const authAttemptLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const path = req.path?.includes("register") ? "register" : "login";
    return `auth:${path}:${ip}`;
  },
  message: "Too many attempts. Please wait a few minutes and try again.",
});

router.post("/register", authAttemptLimit, register);
router.post("/login", authAttemptLimit, login);
router.get("/me", requireAuth, getMe);

export default router;
