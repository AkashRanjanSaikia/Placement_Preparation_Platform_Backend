import express from 'express';
import { runSubmission } from '../controllers/submissionController.js';

const router = express.Router();

router.post('/', runSubmission);

export default router;