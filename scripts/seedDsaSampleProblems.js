import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Problem from "../models/problem.js";
import Template from "../models/template.js";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../data/dsa_sample_problems.json");

/** Judge0 harness templates — {{USER_CODE}} is replaced with the user's solution. */
const HARNESS_BY_SLUG = {
  "maximum-subarray": {
    python: `{{USER_CODE}}

import sys
line = sys.stdin.readline().strip()
nums = list(map(int, line.split(',')))
print(max_subarray(nums))`,
    javascript: `{{USER_CODE}}

let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  const nums = inputData.trim().split(',').map(Number);
  console.log(maxSubarray(nums));
});`,
    java: `import java.util.*;

{{USER_CODE}}

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String[] parts = sc.nextLine().trim().split(",");
        int[] nums = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            nums[i] = Integer.parseInt(parts[i].trim());
        }
        Solution sol = new Solution();
        System.out.println(sol.maxSubarray(nums));
    }
}`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

{{USER_CODE}}

int main() {
    string line;
    getline(cin, line);
    vector<int> nums;
    stringstream ss(line);
    string tok;
    while (getline(ss, tok, ',')) nums.push_back(stoi(tok));
    Solution sol;
    cout << sol.maxSubarray(nums) << endl;
    return 0;
}`,
  },
  "longest-substring-without-repeating": {
    python: `{{USER_CODE}}

import sys
s = sys.stdin.readline().strip()
print(length_of_longest_substring(s))`,
    javascript: `{{USER_CODE}}

let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  const s = inputData.trim();
  console.log(lengthOfLongestSubstring(s));
});`,
    java: `import java.util.*;

{{USER_CODE}}

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.nextLine();
        Solution sol = new Solution();
        System.out.println(sol.lengthOfLongestSubstring(s));
    }
}`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

{{USER_CODE}}

int main() {
    string s;
    getline(cin, s);
    Solution sol;
    cout << sol.lengthOfLongestSubstring(s) << endl;
    return 0;
}`,
  },
  "coin-change": {
    python: `{{USER_CODE}}

import sys
lines = sys.stdin.read().splitlines()
amount = int(lines[0].strip())
coins = list(map(int, lines[1].split(',')))
print(coin_change(amount, coins))`,
    javascript: `{{USER_CODE}}

let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  const lines = inputData.trim().split('\\n');
  const amount = Number(lines[0]);
  const coins = lines[1].split(',').map(Number);
  console.log(coinChange(amount, coins));
});`,
    java: `import java.util.*;

{{USER_CODE}}

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int amount = Integer.parseInt(sc.nextLine().trim());
        String[] parts = sc.nextLine().trim().split(",");
        int[] coins = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            coins[i] = Integer.parseInt(parts[i].trim());
        }
        Solution sol = new Solution();
        System.out.println(sol.coinChange(amount, coins));
    }
}`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

{{USER_CODE}}

int main() {
    int amount;
    cin >> amount;
    cin.ignore();
    string line;
    getline(cin, line);
    vector<int> coins;
    stringstream ss(line);
    string tok;
    while (getline(ss, tok, ',')) coins.push_back(stoi(tok));
    Solution sol;
    cout << sol.coinChange(amount, coins) << endl;
    return 0;
}`,
  },
};

function loadProblems() {
  const raw = JSON.parse(readFileSync(dataPath, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("dsa_sample_problems.json must be an array");
  }
  return raw;
}

function assertHarnesses(problems) {
  for (const p of problems) {
    if (p.difficulty !== "Medium") {
      throw new Error(`${p.slug}: sample set must be Medium difficulty`);
    }
    const harness = HARNESS_BY_SLUG[p.slug];
    if (!harness) {
      throw new Error(`Missing harness templates for slug: ${p.slug}`);
    }
    for (const lang of ["python", "javascript", "java", "cpp"]) {
      if (!harness[lang]?.includes("{{USER_CODE}}")) {
        throw new Error(`Invalid ${lang} harness for ${p.slug}`);
      }
    }
    const hiddenCount = (p.test_cases ?? []).filter((tc) => tc.hidden).length;
    if (hiddenCount !== 3) {
      throw new Error(
        `${p.slug}: expected exactly 3 hidden test cases, got ${hiddenCount}`,
      );
    }
  }
}

async function upsertProblem(doc) {
  const { slug, ...rest } = doc;
  await Problem.findOneAndUpdate(
    { slug },
    { slug, ...rest },
    { upsert: true, returnDocument: "after", runValidators: true },
  );
}

async function upsertTemplates(slug) {
  const harness = HARNESS_BY_SLUG[slug];
  for (const [language, harness_template] of Object.entries(harness)) {
    await Template.findOneAndUpdate(
      { problem_id: slug, language },
      { problem_id: slug, language, harness_template },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
  }
}

async function seed() {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not set in environment");
    }

    const problems = loadProblems();
    assertHarnesses(problems);

    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    for (const problem of problems) {
      await upsertProblem(problem);
      await upsertTemplates(problem.slug);
      console.log(`Upserted problem + templates: ${problem.slug}`);
    }

    console.log(`Done — ${problems.length} DSA sample problem(s) in database.`);
  } catch (err) {
    console.error("DSA sample seed failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

seed();
