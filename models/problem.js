import mongoose from "mongoose";
const { Schema } = mongoose;

const ExampleSchema = new Schema(
  {
    input: { type: String, required: true },
    output: { type: String, required: true },
    explanation: { type: String },
  },
  { _id: false },
);

const ExampleTestCaseSchema = new Schema(
  {
    input: { type: String, required: true },
    output: { type: String, required: true },
  },
  { _id: false },
); 

const TestCaseSchema = new Schema(
  {
    args: { type: String, required: true },      // raw stdin, ready to send as-is
    expected: { type: String, required: true },   // raw expected output, ready to compare
    hidden: { type: Boolean, default: false },
  },
  { _id: false },
);

 

const StarterCodeSchema = new Schema(
  {
    language: {
      type: String,
      required: true,
      enum: ["python", "javascript", "java", "cpp"],
    },
    code: { type: String, required: true },
  },
  { _id: false },
);

const ProblemSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    difficulty: {
      type: String,
      required: true,
      enum: ["Easy", "Medium", "Hard"],
    },
    description: { type: String, required: true },
    constraints: [{ type: String }],
    examples: [ExampleSchema],
    example_test_cases: [ExampleTestCaseSchema],
    test_cases: [TestCaseSchema],
    starter_code: [StarterCodeSchema],
  },
  {
    timestamps: true,
  },
);

const Problem = mongoose.model("Problem", ProblemSchema);

export default Problem;