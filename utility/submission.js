import axios from 'axios';
import 'dotenv/config';

const JUDGE0_URL = process.env.JUDGE0_URL;

const languageMap = {
  python: 71,
  javascript: 63,
  java: 62,
};

export function languageIdToName(languageId) {
  const entry = Object.entries(languageMap).find(([, id]) => id === languageId);
  return entry ? entry[0] : undefined;
}

// Build the array of Judge0 submission objects from the problem's test cases
export function buildSubmissions(fullCode, languageId, testCases) {
  return testCases.map((tc) => ({
    source_code: fullCode,
    language_id: languageId,
    stdin: tc.args,
    expected_output: tc.expected,
  }));
}

export async function submitBatch(submissions) {
  const submitRes = await axios.post(
    `${JUDGE0_URL}/submissions/batch?base64_encoded=false`,
    { submissions },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const tokens = submitRes.data.map((s) => s.token).join(',');

  return pollBatchResults(tokens);
}

async function pollBatchResults(tokens) {
  const maxAttempts = 10;
  const delayMs = 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await axios.get(
      `${JUDGE0_URL}/submissions/batch`,
      {
        params: {
          tokens,
          base64_encoded: false,
          fields: '*',
        },
      }
    );

    const results = res.data.submissions;

    // status.id 1 = In Queue, 2 = Processing — keep polling if any are still pending
    const stillProcessing = results.some((r) => r.status.id === 1 || r.status.id === 2);

    if (!stillProcessing) {
      return results;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Judge0 batch results timed out');
}

export function buildVerdicts(results, testCases) {
  return results.map((r, i) => ({
    testCase: i + 1,
    hidden: testCases[i].hidden,
    stdin: testCases[i].hidden ? undefined : testCases[i].args,
    expected: testCases[i].hidden ? undefined : testCases[i].expected,
    stdout: r.stdout ? r.stdout.trim() : null,
    stderr: r.stderr ? r.stderr.trim() : null,
    compile_output: r.compile_output ? r.compile_output.trim() : null,
    status: r.status?.description,
    passed: r.status?.id === 3, // 3 = Accepted
  }));
}