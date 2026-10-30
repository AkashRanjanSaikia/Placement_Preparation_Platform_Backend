import mongoose from "mongoose";
import DsaSubmission from "../models/dsaSubmission.js";

export async function saveDsaSubmission({
  userId,
  problemSlug,
  problemTitle,
  code,
  languageId,
  language,
  summary,
}) {
  return DsaSubmission.create({
    userId,
    problemSlug,
    problemTitle,
    code,
    languageId,
    language,
    allPassed: summary.allPassed,
    totalTestCases: summary.totalTestCases,
    passedCount: summary.passedCount,
    maxRuntimeMs: summary.maxRuntimeMs ?? null,
    avgRuntimeMs: summary.avgRuntimeMs ?? null,
    failureStatus: summary.failureStatus ?? null,
    compileError: summary.compileError ?? null,
    runtimeError: summary.runtimeError ?? null,
  });
}

export async function getAcceptanceRatesBySlug() {
  const rows = await DsaSubmission.aggregate([
    {
      $group: {
        _id: "$problemSlug",
        total: { $sum: 1 },
        accepted: { $sum: { $cond: ["$allPassed", 1, 0] } },
      },
    },
  ]);

  const map = Object.create(null);
  for (const row of rows) {
    if (!row.total) {
      map[row._id] = "—";
    } else {
      map[row._id] = `${Math.round((row.accepted / row.total) * 100)}%`;
    }
  }
  return map;
}

export async function getUserProblemStatus(userId, slugs) {
  if (!slugs?.length) {
    return {};
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const rows = await DsaSubmission.aggregate([
    {
      $match: {
        userId: userObjectId,
        problemSlug: { $in: slugs },
      },
    },
    {
      $group: {
        _id: "$problemSlug",
        attemptCount: { $sum: 1 },
        accepted: { $max: { $cond: ["$allPassed", 1, 0] } },
        lastSubmittedAt: { $max: "$createdAt" },
      },
    },
  ]);

  const map = Object.create(null);
  for (const row of rows) {
    map[row._id] = {
      solved: row.accepted === 1,
      attemptCount: row.attemptCount,
      lastSubmittedAt: row.lastSubmittedAt,
    };
  }
  return map;
}
