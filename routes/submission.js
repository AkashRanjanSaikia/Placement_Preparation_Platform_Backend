import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  submitCode,
  runCode,
  getMyDsaSubmissions,
  getMyDsaSubmissionById,
  getMyDsaProgress,
} from '../controllers/submissionController.js';

const router = express.Router();

router.post('/run', runCode);
router.post('/submit', requireAuth, submitCode);
router.get('/me', requireAuth, getMyDsaSubmissions);
router.get('/me/progress', requireAuth, getMyDsaProgress);
router.get('/me/:id', requireAuth, getMyDsaSubmissionById);

export default router;