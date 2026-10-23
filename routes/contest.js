import express from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import {
  getContestAttempt,
  getContestById,
  getContestLeaderboard,
  getMyContestSubmissions,
  listContests,
  registerForContest,
  submitContestAnswer,
} from "../controllers/contestController.js";
import {
  hostBrowseLibrary,
  hostCreateContest,
  hostListMyContests,
  hostPublishContest,
  hostRegenerateJoinCode,
  hostUpdateContest,
} from "../controllers/hostContestController.js";

const router = express.Router();

router.get("/", optionalAuth, listContests);

router.get("/host/library", requireAuth, hostBrowseLibrary);
router.get("/host/mine", requireAuth, hostListMyContests);
router.post("/host", requireAuth, hostCreateContest);
router.put("/host/:id", requireAuth, hostUpdateContest);
router.post("/host/:id/publish", requireAuth, hostPublishContest);
router.post("/host/:id/regenerate-join-code", requireAuth, hostRegenerateJoinCode);

router.get("/:id", optionalAuth, getContestById);
router.get("/:id/leaderboard", optionalAuth, getContestLeaderboard);

router.post("/:id/register", requireAuth, registerForContest);
router.get("/:id/attempt", requireAuth, getContestAttempt);
router.get("/:id/my-submissions", requireAuth, getMyContestSubmissions);
router.post("/:id/submit", requireAuth, submitContestAnswer);

export default router;
