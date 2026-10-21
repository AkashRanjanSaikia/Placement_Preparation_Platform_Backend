import express from "express";
import {
  checkQuestionAnswer,
  getQuestionCatalog,
  getQuestions,
} from "../controllers/questionController.js";

const router = express.Router();

router.get("/catalog", getQuestionCatalog);
router.get("/", getQuestions);
router.post("/:id/check", checkQuestionAnswer);

export default router;
