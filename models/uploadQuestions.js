import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Question from "./question.js";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI;
const __dirname = dirname(fileURLToPath(import.meta.url));

const questionsPath = join(__dirname, "questions.json");
const questions = JSON.parse(readFileSync(questionsPath, "utf8"));

async function seedQuestions() {
  const created = await Question.insertMany(questions, { ordered: true });
  console.log(`Inserted ${created.length} questions`);
}

async function seed() {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not set in environment");
    }

    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    await seedQuestions();

    console.log("Question seeding complete");
  } catch (err) {
    console.error("Question seeding failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

seed();
