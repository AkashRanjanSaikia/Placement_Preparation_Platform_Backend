import mongoose from "mongoose";
const { Schema } = mongoose;

const QuestionSchema = new Schema(
  {
    category: {
      type: String,
      enum: ["aptitude", "core_cs"],
      required: true,
      index: true,
    },
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },

    questionText: { type: String, required: true },
    questionType: {
      type: String,
      enum: ["single", "multiple", "numeric"],
      default: "single",
    },
    options: [{ type: String }],
    correctAnswers: [{ type: Number }],
    explanation: { type: String },

    tags: [{ type: String }],
    companies: [{ type: String }],
  },
  { timestamps: true },
);

QuestionSchema.index({ category: 1, subject: 1, topic: 1, difficulty: 1 });

const Question = mongoose.model("Question", QuestionSchema);

export default Question;
