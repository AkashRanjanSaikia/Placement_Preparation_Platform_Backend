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
const basePath = join(__dirname, "../data/prepify_cs_fundamentals_questions.json");
const extraPath = join(__dirname, "../data/prepify_cs_fundamentals_extra.json");

/** Maps legacy question ids to practice topic slugs (12 CS Fundamentals topics). */
const SUBTOPIC_BY_ID = {
  CSF001: "os-cpu-scheduling",
  CSF008: "os-cpu-scheduling",
  CSF012: "os-cpu-scheduling",
  CSF018: "os-cpu-scheduling",
  CSF003: "os-memory-management",
  CSF004: "os-memory-management",
  CSF006: "os-memory-management",
  CSF013: "os-memory-management",
  CSF014: "os-memory-management",
  CSF017: "os-memory-management",
  CSF020: "os-memory-management",
  CSF002: "os-process-management",
  CSF005: "os-process-management",
  CSF007: "os-process-management",
  CSF009: "os-process-management",
  CSF010: "os-process-management",
  CSF011: "os-process-management",
  CSF015: "os-process-management",
  CSF016: "os-process-management",
  CSF019: "os-process-management",
  CSF023: "dbms-sql-queries",
  CSF024: "dbms-sql-queries",
  CSF025: "dbms-sql-queries",
  CSF026: "dbms-sql-queries",
  CSF027: "dbms-sql-queries",
  CSF029: "dbms-sql-queries",
  CSF030: "dbms-sql-queries",
  CSF032: "dbms-sql-queries",
  CSF033: "dbms-sql-queries",
  CSF036: "dbms-sql-queries",
  CSF040: "dbms-sql-queries",
  CSF022: "dbms-normalization",
  CSF031: "dbms-normalization",
  CSF034: "dbms-normalization",
  CSF038: "dbms-normalization",
  CSF021: "dbms-transactions",
  CSF028: "dbms-transactions",
  CSF035: "dbms-transactions",
  CSF037: "dbms-transactions",
  CSF039: "dbms-transactions",
  CSF041: "net-osi-tcp-models",
  CSF047: "net-osi-tcp-models",
  CSF048: "net-osi-tcp-models",
  CSF057: "net-osi-tcp-models",
  CSF043: "net-ip-routing",
  CSF044: "net-ip-routing",
  CSF045: "net-ip-routing",
  CSF051: "net-ip-routing",
  CSF052: "net-ip-routing",
  CSF055: "net-ip-routing",
  CSF059: "net-ip-routing",
  CSF042: "net-transport-app-protocols",
  CSF046: "net-transport-app-protocols",
  CSF049: "net-transport-app-protocols",
  CSF050: "net-transport-app-protocols",
  CSF053: "net-transport-app-protocols",
  CSF054: "net-transport-app-protocols",
  CSF056: "net-transport-app-protocols",
  CSF058: "net-transport-app-protocols",
  CSF060: "net-transport-app-protocols",
  CSF061: "oop-inheritance-polymorphism",
  CSF065: "oop-inheritance-polymorphism",
  CSF068: "oop-encapsulation-abstraction",
  CSF071: "oop-inheritance-polymorphism",
  CSF062: "oop-classes-objects",
  CSF063: "oop-encapsulation-abstraction",
  CSF066: "oop-classes-objects",
  CSF069: "oop-encapsulation-abstraction",
  CSF072: "oop-classes-objects",
  CSF073: "oop-classes-objects",
  CSF074: "oop-classes-objects",
  CSF076: "oop-classes-objects",
  CSF077: "oop-classes-objects",
  CSF078: "oop-classes-objects",
  CSF079: "oop-classes-objects",
  CSF064: "oop-inheritance-polymorphism",
  CSF067: "oop-inheritance-polymorphism",
  CSF070: "oop-inheritance-polymorphism",
  CSF075: "oop-inheritance-polymorphism",
  CSF080: "oop-inheritance-polymorphism",
};

const EXTRA_SUBTOPIC = {
  CSX001: "os-cpu-scheduling",
  CSX002: "os-cpu-scheduling",
  CSX003: "os-cpu-scheduling",
  CSX004: "dbms-normalization",
  CSX005: "dbms-normalization",
  CSX006: "dbms-normalization",
  CSX007: "dbms-transactions",
  CSX008: "dbms-transactions",
  CSX009: "net-osi-tcp-models",
  CSX010: "net-osi-tcp-models",
  CSX011: "net-transport-app-protocols",
  CSX012: "oop-inheritance-polymorphism",
  CSX013: "oop-inheritance-polymorphism",
  CSX014: "oop-inheritance-polymorphism",
  CSX015: "oop-inheritance-polymorphism",
  CSX016: "oop-inheritance-polymorphism",
  CSX017: "net-osi-tcp-models",
  CSX018: "oop-encapsulation-abstraction",
  CSX019: "oop-encapsulation-abstraction",
  CSX020: "oop-encapsulation-abstraction",
  CSX021: "oop-encapsulation-abstraction",
};

function normalizeDifficulty(value) {
  const d = String(value ?? "medium").toLowerCase();
  if (d === "easy" || d === "medium" || d === "hard") return d;
  return "medium";
}

function mapRow(row) {
  const subtopic =
    EXTRA_SUBTOPIC[row.id] ??
    SUBTOPIC_BY_ID[row.id] ??
    row.subtopic ??
    null;

  if (!subtopic) {
    throw new Error(`No subtopic mapping for question ${row.id}`);
  }

  const answer = Number(row.answer);
  if (!Number.isInteger(answer) || answer < 0) {
    throw new Error(`Invalid answer index for question ${row.id}`);
  }

  return {
    category: CATEGORY,
    subject: SUBJECT,
    topic: subtopic,
    difficulty: normalizeDifficulty(row.difficulty),
    questionText: row.question,
    questionType: "single",
    options: row.options,
    correctAnswers: [answer],
    explanation: row.explanation,
    tags: [subtopic],
    companies: [],
  };
}

function loadQuestionRows() {
  const base = JSON.parse(readFileSync(basePath, "utf8"));
  const extra = JSON.parse(readFileSync(extraPath, "utf8"));
  if (!Array.isArray(base) || !Array.isArray(extra)) {
    throw new Error("Question JSON files must be arrays");
  }
  return [...base, ...extra];
}

async function seed() {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not set in environment");
    }

    const raw = loadQuestionRows();
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
