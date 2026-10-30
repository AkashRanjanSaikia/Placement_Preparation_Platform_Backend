import Problem from '../models/problem.js';
import Template from '../models/template.js';
import DsaSubmission from '../models/dsaSubmission.js';
import {
  buildSubmissions,
  submitBatch,
  buildVerdicts,
  languageIdToName,
} from '../utility/submission.js';
import { runCodeOnExampleCases } from '../services/codeRunService.js';
import {
  saveDsaSubmission,
  getUserProblemStatus,
} from '../services/dsaSubmissionService.js';

function buildSummaryFromVerdicts({ mode, slug, language, verdicts }) {
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

  if (mode === 'submit') {
    const firstFailure = verdicts.find((v) => !v.passed);
    if (firstFailure) {
      summary.failureStatus = firstFailure.status;
      summary.compileError = firstFailure.compile_output ?? null;
      summary.runtimeError = firstFailure.stderr ?? null;
    }
  }

  return summary;
}

async function gradeCodeAgainstTestCases(body, testCases, emptyCasesMessage, mode) {
  const { slug, code, languageId } = body;

  if (!slug) {
    return { error: 'slug is required', status: 400 };
  }
  if (!code) {
    return { error: 'code is required', status: 400 };
  }
  if (!languageId) {
    return { error: 'languageId is required', status: 400 };
  }

  const language = languageIdToName(languageId);

  if (!language) {
    return { error: 'Unsupported languageId', status: 400 };
  }

  const problem = await Problem.findOne({ slug });
  const template = await Template.findOne({ problem_id: slug, language });

  if (!problem) {
    return { error: 'Problem not found', status: 404 };
  }
  if (!template) {
    return { error: 'Template not found', status: 404 };
  }
  if (!testCases || testCases.length === 0) {
    return { error: emptyCasesMessage, status: 400 };
  }

  const fullCode = template.harness_template.replace('{{USER_CODE}}', code);

  const submissions = buildSubmissions(fullCode, languageId, testCases);
  const results = await submitBatch(submissions);

  const verdicts = buildVerdicts(results, testCases);
  const summary = buildSummaryFromVerdicts({ mode, slug, language, verdicts });

  return { summary, verdicts, problem };
}

export const runCode = async (req, res) => {
  try {
    const { slug, code, languageId } = req.body;
    const result = await runCodeOnExampleCases({ slug, code, languageId });
    res.json(result);
  } catch (err) {
    console.log(err);
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message });
  }
};

export const submitCode = async (req, res) => {
  try {
    const { slug, code, languageId } = req.body;
    const problem = slug ? await Problem.findOne({ slug }) : null;

    const graded = await gradeCodeAgainstTestCases(
      req.body,
      problem?.test_cases ?? [],
      'Problem has no test cases',
      'submit',
    );

    if (graded.error) {
      return res.status(graded.status).json({ error: graded.error });
    }

    const { summary } = graded;

    const saved = await saveDsaSubmission({
      userId: req.user.id,
      problemSlug: slug,
      problemTitle: problem?.title,
      code,
      languageId,
      language: summary.language,
      summary,
    });

    res.json({
      ...summary,
      submissionId: saved._id,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

export const getMyDsaSubmissions = async (req, res) => {
  try {
    const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
    const limitRaw = Number.parseInt(String(req.query.limit ?? '20'), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 50)
      : 20;

    const filter = { userId: req.user.id };
    if (slug) {
      filter.problemSlug = slug;
    }

    const submissions = await DsaSubmission.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(
        '-code -compileError -runtimeError',
      )
      .lean();

    res.json({
      success: true,
      count: submissions.length,
      data: submissions,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

export const getMyDsaSubmissionById = async (req, res) => {
  try {
    const submission = await DsaSubmission.findOne({
      _id: req.params.id,
      userId: req.user.id,
    }).lean();

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json({ success: true, data: submission });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

export const getMyDsaProgress = async (req, res) => {
  try {
    const slugsParam = req.query.slugs;
    const slugs =
      typeof slugsParam === 'string'
        ? slugsParam
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const statusBySlug = await getUserProblemStatus(req.user.id, slugs);

    res.json({
      success: true,
      data: statusBySlug,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};
