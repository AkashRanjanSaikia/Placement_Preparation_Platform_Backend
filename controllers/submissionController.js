import Problem from '../models/problem.js';
import Template from '../models/template.js';
import { buildSubmissions, submitBatch, buildVerdicts, languageIdToName } from '../utility/submission.js';

export const runSubmission = async (req, res) => {
  try {
    const { problemId, code, languageId } = req.body;

    if (!problemId) {
      return res.status(400).json({ error: 'problemId is required' });
    }
    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }
    if (!languageId) {
      return res.status(400).json({ error: 'languageId is required' });
    }

    const language = languageIdToName(languageId);

    if (!language) {
      return res.status(400).json({ error: 'Unsupported languageId' });
    }

    const problem = await Problem.findOne({ id: problemId });
    const template = await Template.findOne({ problem_id: problemId, language });

    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    if (!problem.test_cases || problem.test_cases.length === 0) {
      return res.status(400).json({ error: 'Problem has no test cases' });
    }

    const fullCode = template.harness_template.replace('{{USER_CODE}}', code);

    const submissions = buildSubmissions(fullCode, languageId, problem.test_cases);
    const results = await submitBatch(submissions);
    console.log(results);
    const verdicts = buildVerdicts(results, problem.test_cases);
    console.log(verdicts);
    const allPassed = verdicts.every((v) => v.passed);

    res.json({
      problemId,
      language,
      allPassed,
      totalTestCases: verdicts.length,
      passedCount: verdicts.filter((v) => v.passed).length,
      verdicts,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};