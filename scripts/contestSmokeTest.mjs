/**
 * End-to-end contest API smoke test. Run with backend up on PORT (default 5000).
 * Usage: node scripts/contestSmokeTest.mjs
 */
import "dotenv/config";
import mongoose from "mongoose";
import Contest from "../models/contest.js";

async function ensureMongo() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(process.env.MONGODB_URI);
}

const BASE = `http://127.0.0.1:${process.env.PORT || 5000}`;
const PASS = "testpass12345";

const results = [];
function pass(name) {
  results.push({ name, ok: true });
  console.log(`  ✓ ${name}`);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name}: ${detail}`);
}

async function req(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function registerUser(label) {
  const email = `smoke_${label}_${Date.now()}@example.com`;
  const reg = await req("POST", "/auth/register", {
    body: { name: `Smoke ${label}`, email, password: PASS },
  });
  if (reg.status !== 201 && reg.status !== 200) {
    throw new Error(`register ${label}: ${reg.status} ${JSON.stringify(reg.data)}`);
  }
  const token = reg.data?.token ?? reg.data?.data?.token;
  const user = reg.data?.user ?? reg.data?.data?.user;
  if (!token) {
    const login = await req("POST", "/auth/login", {
      body: { email, password: PASS },
    });
    if (!login.data?.token) {
      throw new Error(`no token for ${label}`);
    }
    return { email, token: login.data.token, user: login.data.user };
  }
  return { email, token, user };
}

async function waitForServer(maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await req("GET", "/contest?status=live");
      if (r.status === 200) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log("\n=== Contest smoke test ===\n");

  if (!(await waitForServer())) {
    console.error("Backend not reachable at", BASE);
    process.exit(1);
  }
  pass("Backend reachable");

  const host = await registerUser("host");
  pass("Host registered");
  const student = await registerUser("student");
  pass("Student registered");

  const lib = await req("GET", "/contest/host/library?type=DSA&limit=1", {
    token: host.token,
  });
  const dsaItem = lib.data?.data?.[0];
  if (!dsaItem?.id) {
    fail("DSA library", "no problems in DB — seed DSA problems first");
    process.exit(1);
  }
  pass("DSA library has items");

  const libMcq = await req("GET", "/contest/host/library?type=APTITUDE&limit=1", {
    token: host.token,
  });
  const mcqItem = libMcq.data?.data?.[0];
  if (!mcqItem?.id) {
    fail("MCQ library", "no aptitude questions");
    process.exit(1);
  }
  pass("Aptitude library has items");

  const now = Date.now();
  const startLiveDate = new Date(now + 5 * 60_000);
  let endLiveDate = new Date(now + 2 * 60 * 60_000);
  if (
    startLiveDate.getUTCFullYear() !== endLiveDate.getUTCFullYear() ||
    startLiveDate.getUTCMonth() !== endLiveDate.getUTCMonth() ||
    startLiveDate.getUTCDate() !== endLiveDate.getUTCDate()
  ) {
    endLiveDate = new Date(startLiveDate);
    endLiveDate.setUTCHours(23, 59, 59, 999);
  }
  if (endLiveDate <= startLiveDate) {
    endLiveDate = new Date(startLiveDate.getTime() + 30 * 60_000);
  }
  const startLive = startLiveDate.toISOString();
  const endLive = endLiveDate.toISOString();

  const createBody = {
    title: `Smoke contest ${now}`,
    description: "automated test",
    visibility: "private",
    startTime: startLive,
    endTime: endLive,
    maxParticipants: 5,
    sections: [
      {
        type: "DSA",
        name: "DSA",
        marksPerQuestion: 10,
        questions: [
          {
            source: "library",
            libraryRef: { model: "Problem", id: dsaItem.id },
          },
        ],
      },
      {
        type: "APTITUDE",
        name: "Aptitude",
        marksPerQuestion: 5,
        questions: [
          {
            source: "library",
            libraryRef: { model: "Question", id: mcqItem.id },
          },
        ],
      },
    ],
  };

  const created = await req("POST", "/contest/host", {
    token: host.token,
    body: createBody,
  });
  const contestId =
    created.data?.data?.contest?._id ?? created.data?.data?.contest?.id;
  if (created.status !== 201 || !contestId) {
    fail("Create draft", `${created.status} ${JSON.stringify(created.data)}`);
    process.exit(1);
  }
  pass("Host created draft");

  const published = await req("POST", `/contest/host/${contestId}/publish`, {
    token: host.token,
    body: {},
  });
  const joinCode = published.data?.data?.joinCode;
  if (published.status !== 200) {
    fail("Publish", `${published.status} ${JSON.stringify(published.data)}`);
    process.exit(1);
  }
  if (!joinCode) {
    fail("Publish", "missing joinCode");
    process.exit(1);
  }
  pass("Published private contest with join code");

  const badJoin = await req("POST", `/contest/${contestId}/register`, {
    token: student.token,
    body: { joinCode: "WRONG-CODE" },
  });
  if (badJoin.status !== 403) {
    fail("Wrong join code", `expected 403 got ${badJoin.status}`);
  } else {
    pass("Wrong join code rejected");
  }

  const goodJoin = await req("POST", `/contest/${contestId}/register`, {
    token: student.token,
    body: { joinCode },
  });
  if (goodJoin.status !== 201) {
    fail("Register", `${goodJoin.status} ${JSON.stringify(goodJoin.data)}`);
    process.exit(1);
  }
  pass("Student registered with join code");

  await ensureMongo();
  await Contest.findByIdAndUpdate(contestId, {
    startTime: new Date(Date.now() - 60_000),
  });
  pass("Contest startTime moved to past (DB) for live attempt");

  const attempt = await req("GET", `/contest/${contestId}/attempt`, {
    token: student.token,
  });
  if (attempt.status !== 200 || !attempt.data?.data?.sections?.length) {
    fail("Attempt", `${attempt.status} ${JSON.stringify(attempt.data)}`);
    process.exit(1);
  }
  const dsaQ = attempt.data.data.sections
    .flatMap((s) => s.questions.map((q) => ({ ...q, sectionType: s.type })))
    .find((q) => q.sectionType === "DSA");
  const mcqQ = attempt.data.data.sections
    .flatMap((s) => s.questions.map((q) => ({ ...q, sectionType: s.type })))
    .find((q) => q.sectionType === "APTITUDE" || q.sectionType !== "DSA");
  if (!dsaQ?.questionKey) {
    fail("Attempt", "no DSA questionKey");
    process.exit(1);
  }
  pass("Contest attempt loads");

  const saveMcq = await req("PUT", `/contest/${contestId}/answers`, {
    token: student.token,
    body: { questionKey: mcqQ.questionKey, selectedIndex: 0 },
  });
  if (saveMcq.status !== 200) {
    fail("Save MCQ", `${saveMcq.status} ${JSON.stringify(saveMcq.data)}`);
  } else {
    pass("Save MCQ answer");
  }

  const saveDsa = await req("PUT", `/contest/${contestId}/answers`, {
    token: student.token,
    body: {
      questionKey: dsaQ.questionKey,
      code: 'print("1")',
      languageId: 71,
      submitDsaAnswer: true,
    },
  });
  if (saveDsa.status !== 200) {
    fail("Save DSA", `${saveDsa.status} ${JSON.stringify(saveDsa.data)}`);
  } else {
    pass("Save DSA answer");
  }

  const runRes = await req("POST", `/contest/${contestId}/run`, {
    token: student.token,
    body: {
      questionKey: dsaQ.questionKey,
      code: 'print("1")',
      languageId: 71,
    },
  });
  if (runRes.status === 200 && runRes.data?.data?.verdicts) {
    pass("DSA run examples (Judge0)");
  } else if (runRes.status >= 500 || runRes.data?.message?.includes("Judge0")) {
    console.warn(
      "  ⚠ DSA run skipped (Judge0 unavailable):",
      runRes.data?.message ?? runRes.status,
    );
  } else {
    fail("DSA run", `${runRes.status} ${JSON.stringify(runRes.data)}`);
  }

  const finalize = await req("POST", `/contest/${contestId}/finalize`, {
    token: student.token,
    body: { questionKey: dsaQ.questionKey },
  });
  if (finalize.status !== 200) {
    fail("Finalize", `${finalize.status} ${JSON.stringify(finalize.data)}`);
  } else {
    pass("Finalize exam");
  }

  await ensureMongo();
  await Contest.findByIdAndUpdate(contestId, {
    endTime: new Date(Date.now() - 60_000),
    startTime: new Date(Date.now() - 3 * 60 * 60_000),
  });
  pass("Contest endTime moved to past (DB) for leaderboard");

  const lb = await req("GET", `/contest/${contestId}/leaderboard`, {
    token: student.token,
  });
  if (lb.status !== 200) {
    fail("Leaderboard", `${lb.status} ${JSON.stringify(lb.data)}`);
  } else if (!Array.isArray(lb.data?.sectionColumns)) {
    fail("Leaderboard", "missing sectionColumns");
  } else if (!lb.data?.data?.length) {
    fail("Leaderboard", "empty data");
  } else {
    pass("Leaderboard with sectionColumns");
  }

  const detail = await req("GET", `/contest/${contestId}`, {
    token: student.token,
  });
  if (detail.status === 200 && detail.data?.data?.myRank != null) {
    pass("Contest detail includes myRank");
  } else {
    fail(
      "myRank on detail",
      `status=${detail.status} myRank=${detail.data?.data?.myRank}`,
    );
  }

  const hostMine = await req("GET", "/contest/host/mine", {
    token: host.token,
  });
  if (hostMine.status === 200 && hostMine.data?.data?.length) {
    pass("Host mine list");
  } else {
    fail("Host mine", `${hostMine.status}`);
  }

  await mongoose.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== Summary ===");
  console.log(`Passed: ${results.filter((r) => r.ok).length}/${results.length}`);
  if (failed.length) {
    console.error("Failed checks:", failed);
    process.exit(1);
  }
  console.log("\nAll automated API checks passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
