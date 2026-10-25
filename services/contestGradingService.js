import {
  buildSubmissions,
  submitBatch,
  buildVerdicts,
  languageIdToName,
} from "../utility/submission.js";

export function gradeMcqAnswer(snapshot, selectedIndex) {
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
    throw new Error("selectedIndex must be a non-negative integer");
  }

  const isCorrect = snapshot.correctAnswers?.includes(selectedIndex) ?? false;
  return { isCorrect };
}

export async function gradeDsaAnswer(snapshot, code, languageId) {
  if (!code || typeof code !== "string") {
    throw new Error("code is required");
  }
  if (!languageId) {
    throw new Error("languageId is required");
  }

  const language = languageIdToName(languageId);
  if (!language) {
    throw new Error("Unsupported languageId");
  }

  const harness = snapshot.harnessTemplates?.find(
    (item) => item.language === language,
  );
  if (!harness?.harness_template) {
    throw new Error(`No harness template for language "${language}"`);
  }

  const testCases = snapshot.test_cases ?? [];
  if (!testCases.length) {
    throw new Error("Question has no test cases");
  }

  const fullCode = harness.harness_template.replace("{{USER_CODE}}", code);
  const submissions = buildSubmissions(fullCode, languageId, testCases);
  const results = await submitBatch(submissions);
  const verdicts = buildVerdicts(results, testCases);
  const isCorrect = verdicts.every((verdict) => verdict.passed);

  return { isCorrect, verdicts };
}
