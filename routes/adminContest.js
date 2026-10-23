import express from "express";
import { requireAdminKey } from "../middleware/adminKey.js";
import {
  browseContestLibrary,
  createContest,
  listAdminContests,
  publishContest,
  updateContest,
} from "../controllers/adminContestController.js";

const router = express.Router();

router.use(requireAdminKey);

router.get("/", listAdminContests);
router.get("/library", browseContestLibrary);
router.post("/", createContest);
router.put("/:id", updateContest);
router.post("/:id/publish", publishContest);

export default router;
