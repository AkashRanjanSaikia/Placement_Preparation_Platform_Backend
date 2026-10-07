import express from 'express';
import { getProblems, getProblemBySlug } from '../controllers/problemController.js';

const router = express.Router();

router.get('/', getProblems);      // GET /api/problems
router.get('/:slug', getProblemBySlug); // GET /api/problems/two-sum

export default router;