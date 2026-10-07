import Problem from '../models/problem.js';
import Template from '../models/template.js';
import {
  buildSubmissions,
  submitBatch,
  buildVerdicts,
  languageIdToName,
  exampleTestCasesToJudgeCases,
} from '../utility/submission.js';

async function gradeCodeAgainstTestCases(
  req,
  res,
  testCases,
  emptyCasesMessage,
  mode,
) {
  const { slug, code, languageId } = req.body;

  if (!slug) {
    return res.status(400).json({ error: 'slug is required' });
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

  const problem = await Problem.findOne({ slug });
  const template = await Template.findOne({ problem_id: slug, language });

  if (!problem) {
    return res.status(404).json({ error: 'Problem not found' });
  }
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  if (!testCases || testCases.length === 0) {
    return res.status(400).json({ error: emptyCasesMessage });
  }

  const fullCode = template.harness_template.replace('{{USER_CODE}}', code);
  
  const submissions = buildSubmissions(fullCode, languageId, testCases);
  const results = await submitBatch(submissions);

  const verdicts = buildVerdicts(results, testCases);

  const allPassed = verdicts.every((v) => v.passed);
  const runtimeValues = verdicts
    .map((v) => v.runtimeMs)
    .filter((ms) => ms != null);

  const passedCount = verdicts.filter((v) => v.passed).length;
  const summary = {
    mode,
    slug,
    language,
    allPassed,
    totalTestCases: verdicts.length,
    passedCount,
    maxRuntimeMs: runtimeValues.length
      ? Math.max(...runtimeValues)
      : null,
    avgRuntimeMs: runtimeValues.length
      ? Math.round(
          runtimeValues.reduce((sum, ms) => sum + ms, 0) / runtimeValues.length,
        )
      : null,
  };

  if (mode === 'run') {
    res.json({ ...summary, verdicts });
    return;
  }

  const firstFailure = verdicts.find((v) => !v.passed);
  res.json({
    ...summary,
    ...(firstFailure && {
      failureStatus: firstFailure.status,
      compileError: firstFailure.compile_output ?? null,
      runtimeError: firstFailure.stderr ?? null,
    }),
  });
}

export const runCode = async (req, res) => {
  try {
    const { slug } = req.body;
    const problem = slug ? await Problem.findOne({ slug }) : null;
    const testCases = problem?.example_test_cases
      ? exampleTestCasesToJudgeCases(
          problem.example_test_cases,
          problem.examples,
        )
      : [];

    await gradeCodeAgainstTestCases(
      req,
      res,
      testCases,
      'Problem has no example test cases',
      'run',
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

export const submitCode = async (req, res) => {
  try {
    const { slug } = req.body;
    const problem = slug ? await Problem.findOne({ slug }) : null;

    await gradeCodeAgainstTestCases(
      req,
      res,
      problem?.test_cases ?? [],
      'Problem has no test cases',
      'submit',
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};