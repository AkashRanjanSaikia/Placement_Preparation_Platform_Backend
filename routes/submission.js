import express from 'express';
import { submitCode, runCode } from '../controllers/submissionController.js';

const router = express.Router();

router.post('/run', runCode);
router.post('/submit', submitCode);

export default router;