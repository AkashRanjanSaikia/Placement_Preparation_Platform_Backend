import mongoose from 'mongoose';
import Problem from './problems.js';
import Template from './template.js'; // adjust path to your Template model
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;

const problems = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    description:
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input has exactly one solution, and you may not use the same element twice.',
    constraints: [
      '2 <= nums.length <= 10^4',
      '-10^9 <= nums[i] <= 10^9',
      'Only one valid answer exists.'
    ],
    examples: [
      {
        input: 'nums = [2,7,11,15], target = 9',
        output: '[0, 1]',
        explanation: 'nums[0] + nums[1] == 9, so return [0, 1].'
      },
      {
        input: 'nums = [3,2,4], target = 6',
        output: '[1, 2]',
        explanation: 'nums[1] + nums[2] == 6, so return [1, 2].'
      }
    ],
    test_cases: [
      { args: '2,7,11,15\n9', expected: '0,1', hidden: false },
      { args: '3,2,4\n6', expected: '1,2', hidden: false },
      { args: '3,3\n6', expected: '0,1', hidden: true },
      { args: '1,5,9,13,2\n11', expected: '2,4', hidden: true }
    ],
    starter_code: [
      { language: 'python', code: 'def two_sum(nums, target):\n    pass' },
      { language: 'javascript', code: 'function twoSum(nums, target) {\n\n}' },
      {
        language: 'java',
        code: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        \n    }\n}'
      }
    ]
  },
  {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    description:
      "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid. An input string is valid if: open brackets are closed by the same type of brackets, and open brackets are closed in the correct order.",
    constraints: [
      '1 <= s.length <= 10^4',
      "s consists of parentheses only '()[]{}'."
    ],
    examples: [
      {
        input: 's = "()"',
        output: 'true',
        explanation: 'The brackets match and are properly closed.'
      },
      {
        input: 's = "(]"',
        output: 'false',
        explanation: 'The brackets do not match.'
      }
    ],
    test_cases: [
      { args: '()', expected: 'true', hidden: false },
      { args: '()[]{}', expected: 'true', hidden: false },
      { args: '(]', expected: 'false', hidden: true },
      { args: '([)]', expected: 'false', hidden: true },
      { args: '{[]}', expected: 'true', hidden: true }
    ],
    starter_code: [
      { language: 'python', code: 'def is_valid(s):\n    pass' },
      { language: 'javascript', code: 'function isValid(s) {\n\n}' },
      {
        language: 'java',
        code: 'class Solution {\n    public boolean isValid(String s) {\n        \n    }\n}'
      }
    ]
  }
];


const templates = [
  {
    problem_id: 'two-sum',
    language: 'python',
    harness_template: `{{USER_CODE}}

import sys
lines = sys.stdin.read().splitlines()
nums = list(map(int, lines[0].split(',')))
target = int(lines[1])
result = two_sum(nums, target)
print(','.join(map(str, result)))`
  },
  {
    problem_id: 'two-sum',
    language: 'javascript',
    harness_template: `{{USER_CODE}}

let inputData = '';
process.stdin.on('data', chunk => inputData += chunk);
process.stdin.on('end', () => {
  const lines = inputData.trim().split('\\n');
  const nums = lines[0].split(',').map(Number);
  const target = Number(lines[1]);
  const result = twoSum(nums, target);
  console.log(result.join(','));
});`
  },
  {
    problem_id: 'two-sum',
    language: 'java',
    harness_template: `import java.util.*;

{{USER_CODE}}

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String[] numStrs = sc.nextLine().trim().split(",");
        int[] nums = new int[numStrs.length];
        for (int i = 0; i < numStrs.length; i++) nums[i] = Integer.parseInt(numStrs[i].trim());
        int target = Integer.parseInt(sc.nextLine().trim());

        Solution sol = new Solution();
        int[] result = sol.twoSum(nums, target);

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < result.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(result[i]);
        }
        System.out.println(sb.toString());
    }
}`
  },
  {
    problem_id: 'valid-parentheses',
    language: 'python',
    harness_template: `{{USER_CODE}}

import sys
s = sys.stdin.readline().strip()
result = is_valid(s)
print(str(result).lower())`
  },
  {
    problem_id: 'valid-parentheses',
    language: 'javascript',
    harness_template: `{{USER_CODE}}

let inputData = '';
process.stdin.on('data', chunk => inputData += chunk);
process.stdin.on('end', () => {
  const s = inputData.trim();
  const result = isValid(s);
  console.log(result);
});`
  },
  {
    problem_id: 'valid-parentheses',
    language: 'java',
    harness_template: `{{USER_CODE}}

public class Main {
    public static void main(String[] args) {
        java.util.Scanner sc = new java.util.Scanner(System.in);
        String s = sc.nextLine();
        Solution sol = new Solution();
        boolean result = sol.isValid(s);
        System.out.println(result);
    }
}`
  }
];


async function seedProblems() {
  for (const problem of problems) {
    await Problem.findOneAndUpdate(
      { id: problem.id },
      problem,
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    console.log(`Upserted problem: ${problem.id}`);
  }
}

async function seedTemplates() {
  for (const template of templates) {
    await Template.findOneAndUpdate(
      { problem_id: template.problem_id, language: template.language },
      template,
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    console.log(`Upserted template: ${template.problem_id} / ${template.language}`);
  }
}

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    await seedProblems();
    await seedTemplates();

    console.log('Seeding complete');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seed();