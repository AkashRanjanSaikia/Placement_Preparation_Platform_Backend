import mongoose from "mongoose";

const { Schema } = mongoose;

const ContestRegistrationSchema = new Schema(
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
    registeredAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

ContestRegistrationSchema.index({ contestId: 1, userId: 1 }, { unique: true });

const ContestRegistration = mongoose.model(
  "ContestRegistration",
  ContestRegistrationSchema,
);

export default ContestRegistration;
