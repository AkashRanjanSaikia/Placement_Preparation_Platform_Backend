import mongoose from "mongoose";
import ContestSubmission from "../models/contestSubmission.js";
import User from "../models/user.js";

export async function buildLeaderboard(contestId, contestStartTime) {
  const startMs = new Date(contestStartTime).getTime();
  const contestObjectId =
    contestId instanceof mongoose.Types.ObjectId
      ? contestId
      : new mongoose.Types.ObjectId(contestId);

  const grouped = await ContestSubmission.aggregate([
    { $match: { contestId: contestObjectId } },
    {
      $group: {
        _id: "$userId",
        totalScore: { $sum: "$marksAwarded" },
        lastSubmittedAt: { $max: "$submittedAt" },
        sectionScores: {
          $push: {
            sectionKey: "$sectionKey",
            sectionType: "$sectionType",
            marksAwarded: "$marksAwarded",
          },
        },
      },
    },
  ]);

  const submitterIds = grouped.map((row) => row._id);
  const users = await User.find({ _id: { $in: submitterIds } }).select(
    "name email",
  );
  const userById = new Map(users.map((user) => [user._id.toString(), user]));

  const entries = grouped
    .map((row) => {
      const sectionTotals = {};
      for (const item of row.sectionScores) {
        sectionTotals[item.sectionKey] =
          (sectionTotals[item.sectionKey] ?? 0) + item.marksAwarded;
      }

      const lastMs = new Date(row.lastSubmittedAt).getTime();
      const totalTimeTakenMs = Number.isNaN(lastMs - startMs)
        ? null
        : Math.max(0, lastMs - startMs);

      const user = userById.get(row._id.toString());

      return {
        userId: row._id.toString(),
        name: user?.name ?? "Unknown",
        totalScore: row.totalScore,
        sectionScores: sectionTotals,
        totalTimeTakenMs,
        lastSubmittedAt: row.lastSubmittedAt,
      };
    })
  entries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    const aTime = a.totalTimeTakenMs ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.totalTimeTakenMs ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  return entries.map((entry, index) => ({
    rank: index + 1,
    ...entry,
  }));
}
