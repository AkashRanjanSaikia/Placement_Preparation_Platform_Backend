import Problem from "../models/problem.js";
import Template from "../models/template.js";
import {
  buildSubmissions,
  submitBatch,
  buildVerdicts,
  languageIdToName,
  exampleTestCasesToJudgeCases,
} from "../utility/submission.js";

/**
 * Run user code against example (visible) test cases using the problem harness.
 */
export async function runCodeOnExampleCases({
  slug,
  code,
  languageId,
  exampleTestCases,
  examples = [],
}) {
  if (!slug) {
    throw Object.assign(new Error("slug is required"), { status: 400 });
  }
  if (!code || typeof code !== "string") {
    throw Object.assign(new Error("code is required"), { status: 400 });
  }
  if (!languageId) {
    throw Object.assign(new Error("languageId is required"), { status: 400 });
  }

  const language = languageIdToName(languageId);
  if (!language) {
    throw Object.assign(new Error("Unsupported languageId"), { status: 400 });
  }

  const problem = await Problem.findOne({ slug });
  const template = await Template.findOne({ problem_id: slug, language });

  if (!problem) {
    throw Object.assign(new Error("Problem not found"), { status: 404 });
  }
  if (!template) {
    throw Object.assign(new Error("Template not found for this language"), {
      status: 404,
    });
  }

  const testCases = exampleTestCases?.length
    ? exampleTestCasesToJudgeCases(exampleTestCases, examples)
    : exampleTestCasesToJudgeCases(
        problem.example_test_cases ?? [],
        problem.examples ?? [],
      );

  if (!testCases.length) {
    throw Object.assign(new Error("No example test cases to run against"), {
      status: 400,
    });
  }

  const fullCode = template.harness_template.replace("{{USER_CODE}}", code);
  const submissions = buildSubmissions(fullCode, languageId, testCases);
  const results = await submitBatch(submissions);
  const verdicts = buildVerdicts(results, testCases);

  const allPassed = verdicts.every((v) => v.passed);
  const runtimeValues = verdicts
    .map((v) => v.runtimeMs)
    .filter((ms) => ms != null);
  const passedCount = verdicts.filter((v) => v.passed).length;

  return {
    mode: "run",
    slug,
    language,
    allPassed,
    totalTestCases: verdicts.length,
    passedCount,
    maxRuntimeMs: runtimeValues.length ? Math.max(...runtimeValues) : null,
    avgRuntimeMs: runtimeValues.length
      ? Math.round(
          runtimeValues.reduce((sum, ms) => sum + ms, 0) / runtimeValues.length,
        )
      : null,
    verdicts,
  };
}
