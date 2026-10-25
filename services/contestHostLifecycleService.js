import Contest from "../models/contest.js";
import ContestRegistration from "../models/contestRegistration.js";
import { gradeAllPendingForContest } from "./contestExamService.js";
import { getRuntimeStatus } from "../utility/contestStatus.js";

export function isContestDeleted(contest) {
  return Boolean(contest?.deletedAt);
}

export async function stopContestByHost(contest) {
  if (!contest?.published) {
    throw new Error("Only published contests can be stopped");
  }
  if (isContestDeleted(contest)) {
    throw new Error("This contest was deleted");
  }
  if (contest.hostStoppedAt) {
    throw new Error("Contest is already stopped");
  }

  const status = getRuntimeStatus(contest);
  if (status === "completed") {
    throw new Error("Contest has already ended");
  }

  const now = new Date();
  contest.hostStoppedAt = now;
  if (new Date(contest.endTime).getTime() > now.getTime()) {
    contest.endTime = now;
  }
  await contest.save();

  await gradeAllPendingForContest(contest._id);
  await ContestRegistration.updateMany(
    {
      contestId: contest._id,
      roomEnteredAt: { $ne: null },
      examFinalizedAt: null,
    },
    { $set: { examFinalizedAt: now, roomLockedAt: now } },
  );

  return contest;
}

export async function deleteContestByHost(contest, confirmTitle) {
  const expected = String(contest?.title ?? "").trim();
  const provided = String(confirmTitle ?? "").trim();
  if (!expected || provided !== expected) {
    throw new Error("Type the contest title exactly to confirm deletion");
  }

  if (!contest.published) {
    await Contest.deleteOne({ _id: contest._id });
    return { mode: "hard" };
  }

  if (isContestDeleted(contest)) {
    throw new Error("Contest is already deleted");
  }

  const status = getRuntimeStatus(contest);
  if (status !== "completed" && !contest.hostStoppedAt) {
    await stopContestByHost(contest);
  }

  const toMark = await Contest.findById(contest._id);
  if (!toMark) {
    throw new Error("Contest not found");
  }
  toMark.deletedAt = new Date();
  await toMark.save();

  return { mode: "soft" };
}
