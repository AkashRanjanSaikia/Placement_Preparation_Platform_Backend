import mongoose from "mongoose";

const { Schema } = mongoose;

const ContestSubmissionSchema = new Schema(
  {
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    questionKey: { type: String, required: true },
    sectionKey: { type: String, required: true },
    sectionType: {
      type: String,
      enum: ["DSA", "APTITUDE", "CORE_CS"],
      required: true,
    },
    selectedIndex: { type: Number },
    code: { type: String },
    languageId: { type: Number },
    graded: { type: Boolean, default: false, index: true },
    isCorrect: { type: Boolean, default: null },
    marksAwarded: { type: Number, default: 0 },
    lastSavedAt: { type: Date, default: Date.now },
    /** DSA only: set when the user explicitly saves/submits that answer for grading. */
    dsaAnswerSubmittedAt: { type: Date },
    submittedAt: { type: Date },
  },
  { timestamps: true },
);

ContestSubmissionSchema.index(
  { contestId: 1, userId: 1, questionKey: 1 },
  { unique: true },
);

const ContestSubmission = mongoose.model(
  "ContestSubmission",
  ContestSubmissionSchema,
);

export default ContestSubmission;
