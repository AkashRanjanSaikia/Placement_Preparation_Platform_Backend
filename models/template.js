import mongoose from "mongoose";
const { Schema } = mongoose;

const TemplateSchema = new Schema(
  {
    problem_id: { type: String, required: true }, // matches Problem.slug
    language: {
      type: String,
      required: true,
      enum: ["python", "javascript", "java", "cpp"],
    },
    harness_template: { type: String, required: true }, // has {{USER_CODE}} placeholder
  },
  { timestamps: true },
);

TemplateSchema.index({ problem_id: 1, language: 1 }, { unique: true });

const Template = mongoose.model("Template", TemplateSchema);

export default Template;