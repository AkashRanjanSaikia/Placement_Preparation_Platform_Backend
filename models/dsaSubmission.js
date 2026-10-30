import mongoose from "mongoose";

const { Schema } = mongoose;

const DsaSubmissionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    problemSlug: { type: String, required: true, index: true },
    problemTitle: { type: String },
    code: { type: String, required: true },
    languageId: { type: Number, required: true },
    language: {
      type: String,
      required: true,
      enum: ["python", "javascript", "java", "cpp"],
    },
    allPassed: { type: Boolean, required: true, index: true },
    totalTestCases: { type: Number, required: true },
    passedCount: { type: Number, required: true },
    maxRuntimeMs: { type: Number, default: null },
    avgRuntimeMs: { type: Number, default: null },
    failureStatus: { type: String, default: null },
    compileError: { type: String, default: null },
    runtimeError: { type: String, default: null },
  },
  { timestamps: true },
);

DsaSubmissionSchema.index({ userId: 1, problemSlug: 1, createdAt: -1 });
DsaSubmissionSchema.index({ problemSlug: 1, createdAt: -1 });

const DsaSubmission = mongoose.model("DsaSubmission", DsaSubmissionSchema);

export default DsaSubmission;
