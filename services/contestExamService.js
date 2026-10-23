import Contest from "../models/contest.js";
import ContestRegistration from "../models/contestRegistration.js";
import ContestSubmission from "../models/contestSubmission.js";
import { findContestQuestion } from "./contestSnapshotService.js";
import { gradeDsaAnswer, gradeMcqAnswer } from "./contestGradingService.js";
import { getRuntimeStatus } from "../utility/contestStatus.js";

export async function getRegistrationRecord(contestId, userId) {
  return ContestRegistration.findOne({ contestId, userId });
}

export async function assertCanEditAnswers(contest, registration) {
  if (contest?.deletedAt) {
    throw new Error("This contest was removed by the host");
  }
  if (contest?.hostStoppedAt) {
    throw new Error("The host ended this contest");
  }
  const status = getRuntimeStatus(contest);
  if (status !== "live") {
    throw new Error("Answers can only be changed while the contest is live");
  }
  if (registration?.examFinalizedAt) {
    throw new Error("Your answers are already submitted for this contest");
  }
  if (registration?.roomLockedAt) {
    throw new Error("Your contest attempt is closed — you cannot re-enter the room");
  }
}

export async function saveContestAnswerDraft({
  contest,
  userId,
  questionKey,
  body,
}) {
  const match = findContestQuestion(contest, questionKey);
  if (!match) {
    throw new Error("Question not found in this contest");
  }

  const { section } = match;

  if (section.type === "DSA") {
    if (!body?.code || typeof body.code !== "string") {
      throw new Error("code is required");
    }
    if (!body?.languageId) {
      throw new Error("languageId is required");
    }
    if (body.submitDsaAnswer !== true) {
      throw new Error(
        "DSA answers must be saved with submitDsaAnswer (use Save answer in the contest room)",
      );
    }
  } else if (!Number.isInteger(body?.selectedIndex) || body.selectedIndex < 0) {
    throw new Error("selectedIndex must be a non-negative integer");
  }

  await ContestSubmission.findOneAndUpdate(
    { contestId: contest._id, userId, questionKey },
    {
      contestId: contest._id,
      userId,
      questionKey,
      sectionKey: section.sectionKey,
      sectionType: section.type,
      selectedIndex:
        section.type === "DSA" ? undefined : Number(body.selectedIndex),
      code: section.type === "DSA" ? body.code : undefined,
      languageId:
        section.type === "DSA" ? Number(body.languageId) : undefined,
      dsaAnswerSubmittedAt:
        section.type === "DSA" ? new Date() : undefined,
      graded: false,
      isCorrect: null,
      marksAwarded: 0,
      lastSavedAt: new Date(),
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
}

export async function gradeSubmissionRow(contest, submission) {
  const match = findContestQuestion(contest, submission.questionKey);
  if (!match) {
    submission.graded = true;
    submission.isCorrect = false;
    submission.marksAwarded = 0;
    submission.submittedAt = new Date();
    await submission.save();
    return;
  }

  const { section, question } = match;
  const snapshot = question.snapshot;
  let isCorrect = false;

  try {
    if (section.type === "DSA") {
      if (!submission.dsaAnswerSubmittedAt) {
        isCorrect = false;
      } else if (!submission.code || !submission.languageId) {
        isCorrect = false;
      } else {
        const result = await gradeDsaAnswer(
          snapshot,
          submission.code,
          submission.languageId,
        );
        isCorrect = result.isCorrect;
      }
    } else if (
      submission.selectedIndex != null &&
      Number.isInteger(submission.selectedIndex)
    ) {
      const result = gradeMcqAnswer(snapshot, submission.selectedIndex);
      isCorrect = result.isCorrect;
    }
  } catch {
    isCorrect = false;
  }

  submission.graded = true;
  submission.isCorrect = isCorrect;
  submission.marksAwarded = isCorrect ? section.marksPerQuestion : 0;
  submission.submittedAt = new Date();
  await submission.save();
}

export async function gradeAllAnswersForUser(contestId, userId) {
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new Error("Contest not found");
  }

  const submissions = await ContestSubmission.find({
    contestId,
    userId,
    graded: false,
  });

  for (const row of submissions) {
    await gradeSubmissionRow(contest, row);
  }
}

export async function gradeAllPendingForContest(contestId) {
  const contest = await Contest.findById(contestId);
  if (!contest) return;

  const submissions = await ContestSubmission.find({
    contestId,
    graded: false,
  });

  for (const row of submissions) {
    const hasContent =
      row.sectionType === "DSA"
        ? Boolean(row.dsaAnswerSubmittedAt)
        : row.selectedIndex != null;
    if (!hasContent) continue;
    await gradeSubmissionRow(contest, row);
  }
}

export async function finalizeUserExam(contest, userId) {
  await gradeAllAnswersForUser(contest._id, userId);

  const now = new Date();
  await ContestRegistration.findOneAndUpdate(
    { contestId: contest._id, userId },
    { examFinalizedAt: now, roomLockedAt: now },
  );
}
