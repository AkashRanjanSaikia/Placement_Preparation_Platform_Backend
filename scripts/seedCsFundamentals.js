import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Question from "../models/question.js";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI;
const CATEGORY = "core_cs";
const SUBJECT = "fundamentals";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(
  __dirname,
  "../data/prepify_cs_fundamentals_questions.json",
);

const TOPIC_SLUGS = {
  "Operating Systems": "operating-systems",
  DBMS: "dbms",
  "Computer Networks": "computer-networks",
  OOP: "oop",
};

function normalizeDifficulty(value) {
  const d = String(value ?? "medium").toLowerCase();
  if (d === "easy" || d === "medium" || d === "hard") return d;
  return "medium";
}

function mapRow(row) {
  const topicLabel = row.topic;
  const topic = TOPIC_SLUGS[topicLabel];
  if (!topic) {
    throw new Error(`Unknown topic "${topicLabel}" in question ${row.id}`);
  }

  const answer = Number(row.answer);
  if (!Number.isInteger(answer) || answer < 0) {
    throw new Error(`Invalid answer index for question ${row.id}`);
  }

  return {
    category: CATEGORY,
    subject: SUBJECT,
    topic,
    difficulty: normalizeDifficulty(row.difficulty),
    questionText: row.question,
    questionType: "single",
    options: row.options,
    correctAnswers: [answer],
    explanation: row.explanation,
    tags: topicLabel ? [topicLabel] : [],
    companies: [],
  };
}

async function seed() {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not set in environment");
    }

    const raw = JSON.parse(readFileSync(dataPath, "utf8"));
    if (!Array.isArray(raw)) {
      throw new Error("Expected a JSON array of questions");
    }

    const documents = raw.map(mapRow);

    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const deleted = await Question.deleteMany({ category: CATEGORY });
    console.log(`Removed ${deleted.deletedCount} existing ${CATEGORY} question(s)`);

    const created = await Question.insertMany(documents, { ordered: true });
    console.log(`Inserted ${created.length} CS Fundamentals questions`);

    const byTopic = await Question.aggregate([
      { $match: { category: CATEGORY } },
      { $group: { _id: "$topic", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    console.log("Counts by topic:", byTopic);
  } catch (err) {
    console.error("CS Fundamentals seed failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

seed();
