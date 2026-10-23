import mongoose from "mongoose";

const { Schema } = mongoose;

const LibraryRefSchema = new Schema(
  {
    model: { type: String, enum: ["Problem", "Question"], required: true },
    id: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);

const ContestSectionQuestionSchema = new Schema(
  {
    questionKey: { type: String, required: true },
    source: { type: String, enum: ["library", "custom"], required: true },
    libraryRef: LibraryRefSchema,
    snapshot: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const ContestSectionSchema = new Schema(
  {
    sectionKey: { type: String, required: true },
    type: {
      type: String,
      enum: ["DSA", "APTITUDE", "CORE_CS"],
      required: true,
    },
    name: { type: String, required: true, trim: true },
    marksPerQuestion: { type: Number, required: true, min: 0 },
    questions: {
      type: [ContestSectionQuestionSchema],
      default: [],
    },
  },
  { _id: false },
);

const ContestSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true },
    rules: { type: String, default: "", trim: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    maxParticipants: { type: Number, min: 1 },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
      index: true,
    },
    joinCodeHash: { type: String, select: false },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    published: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },
    hostStoppedAt: { type: Date, default: null, index: true },
    deletedAt: { type: Date, default: null, index: true },
    sections: { type: [ContestSectionSchema], default: [] },
  },
  { timestamps: true },
);

ContestSchema.index({ published: 1, startTime: 1, endTime: 1 });

const Contest = mongoose.model("Contest", ContestSchema);

export default Contest;
