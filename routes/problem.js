import express from 'express';
import { getProblems, getProblemById } from '../controllers/problemController.js';

const router = express.Router();

router.get('/', getProblems);      // GET /api/problems
router.get('/:id', getProblemById); // GET /api/problems/two-sum

export default router;