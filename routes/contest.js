import express from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../utility/rateLimit.js";
import {
  getContestAttempt,
  getContestById,
  getContestLeaderboard,
  getMyContestSubmissions,
  listContests,
  registerForContest,
  runContestDsaCode,
  saveContestAnswer,
  finalizeContestExam,
} from "../controllers/contestController.js";
import {
  hostBrowseLibrary,
  hostCreateContest,
  hostDeleteDraft,
  hostGetContest,
  hostListMyContests,
  hostPublishContest,
  hostRegenerateJoinCode,
  hostUpdateContest,
} from "../controllers/hostContestController.js";

const contestUserKey = (req) =>
  req.user?.id ? `${req.user.id}:${req.params.id}` : null;

const saveAnswerRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 40,
  keyGenerator: (req) =>
    contestUserKey(req) ? `contest-save:${contestUserKey(req)}` : null,
});

const finalizeRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) =>
    contestUserKey(req) ? `contest-finalize:${contestUserKey(req)}` : null,
});

const runCodeRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) =>
    contestUserKey(req) ? `contest-run:${contestUserKey(req)}` : null,
});

const router = express.Router();

router.get("/", optionalAuth, listContests);

router.get("/host/library", requireAuth, hostBrowseLibrary);
router.get("/host/mine", requireAuth, hostListMyContests);
router.get("/host/:id", requireAuth, hostGetContest);
router.delete("/host/:id", requireAuth, hostDeleteDraft);
router.post("/host", requireAuth, hostCreateContest);
router.put("/host/:id", requireAuth, hostUpdateContest);
router.post("/host/:id/publish", requireAuth, hostPublishContest);
router.post("/host/:id/regenerate-join-code", requireAuth, hostRegenerateJoinCode);

router.get("/:id", optionalAuth, getContestById);
router.get("/:id/leaderboard", optionalAuth, getContestLeaderboard);

router.post("/:id/register", requireAuth, registerForContest);
router.get("/:id/attempt", requireAuth, getContestAttempt);
router.get("/:id/my-submissions", requireAuth, getMyContestSubmissions);
router.post("/:id/run", requireAuth, runCodeRateLimit, runContestDsaCode);
router.put("/:id/answers", requireAuth, saveAnswerRateLimit, saveContestAnswer);
router.post(
  "/:id/finalize",
  requireAuth,
  finalizeRateLimit,
  finalizeContestExam,
);

export default router;
