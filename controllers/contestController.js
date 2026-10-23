import mongoose from "mongoose";
import Contest from "../models/contest.js";
import ContestRegistration from "../models/contestRegistration.js";
import ContestSubmission from "../models/contestSubmission.js";
import {
  getRuntimeStatus,
  serverTimePayload,
} from "../utility/contestStatus.js";
import { sanitizeSnapshotForAttempt } from "../services/contestSnapshotService.js";
import { buildLeaderboard } from "../services/leaderboardService.js";
import {
  assertCanEditAnswers,
  finalizeUserExam,
  getRegistrationRecord,
  gradeAllPendingForContest,
  saveContestAnswerDraft,
} from "../services/contestExamService.js";
import { verifyJoinCode } from "../services/joinCodeService.js";
import { findContestQuestion } from "../services/contestSnapshotService.js";
import { runCodeOnExampleCases } from "../services/codeRunService.js";
import { consumeRateLimit } from "../utility/rateLimit.js";
import { buildOrderedResultRows } from "../services/contestResultsService.js";

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return new mongoose.Types.ObjectId(id);
}

function publicContestSummary(contest, extras = {}, viewerUserId = null) {
  const sections = (contest.sections ?? []).map((section) => ({
    sectionKey: section.sectionKey,
    type: section.type,
    name: section.name,
    marksPerQuestion: section.marksPerQuestion,
    questionCount: section.questions?.length ?? 0,
  }));

  const visibility = contest.visibility ?? "public";
  const hostId = contest.createdBy?._id
    ? contest.createdBy._id.toString()
    : contest.createdBy?.toString?.() ?? null;

  return {
    id: contest._id.toString(),
    title: contest.title,
    description: contest.description,
    rules: contest.rules,
    startTime: contest.startTime,
    endTime: contest.endTime,
    maxParticipants: contest.maxParticipants,
    visibility,
    requiresJoinCode: visibility === "private",
    hostName: contest.createdBy?.name ?? null,
    hostId,
    isHost: Boolean(viewerUserId && hostId && viewerUserId === hostId),
    published: contest.published,
    publishedAt: contest.publishedAt,
    sections,
    status: getRuntimeStatus(contest),
    ...extras,
  };
}

async function getParticipantCount(contestId) {
  return ContestRegistration.countDocuments({ contestId });
}

async function isUserRegistered(contestId, userId) {
  if (!userId) return false;
  const existing = await ContestRegistration.findOne({
    contestId,
    userId,
  }).select("_id");
  return Boolean(existing);
}

function buildStatusFilter(status, now) {
  if (!status) {
    return { published: true };
  }

  const normalized = String(status).toLowerCase();
  if (normalized === "upcoming") {
    return { published: true, startTime: { $gt: now } };
  }
  if (normalized === "live") {
    return {
      published: true,
      startTime: { $lte: now },
      endTime: { $gte: now },
    };
  }
  if (normalized === "completed") {
    return { published: true, endTime: { $lt: now } };
  }

  return null;
}

export const listContests = async (req, res, next) => {
  try {
    const now = new Date();
    const filter = buildStatusFilter(req.query?.status, now);
    if (!filter) {
      return res.status(400).json({
        success: false,
        message: "status must be upcoming, live, or completed",
      });
    }

    const contests = await Contest.find(filter)
      .populate("createdBy", "name")
      .sort({ startTime: 1 });
    const contestIds = contests.map((contest) => contest._id);

    const registrationCounts = await ContestRegistration.aggregate([
      { $match: { contestId: { $in: contestIds } } },
      { $group: { _id: "$contestId", count: { $sum: 1 } } },
    ]);
    const countByContest = new Map(
      registrationCounts.map((row) => [row._id.toString(), row.count]),
    );

    let registeredSet = new Set();
    if (req.user?.id && contestIds.length) {
      const registrations = await ContestRegistration.find({
        contestId: { $in: contestIds },
        userId: req.user.id,
      }).select("contestId");
      registeredSet = new Set(
        registrations.map((row) => row.contestId.toString()),
      );
    }

    res.status(200).json({
      success: true,
      data: contests.map((contest) =>
        publicContestSummary(
          contest,
          {
            participantCount: countByContest.get(contest._id.toString()) ?? 0,
            registered: registeredSet.has(contest._id.toString()),
          },
          req.user?.id,
        ),
      ),
      ...serverTimePayload(now),
    });
  } catch (err) {
    next(err);
  }
};

export const getContestById = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id).populate(
      "createdBy",
      "name",
    );
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const registered = await isUserRegistered(contest._id, req.user?.id);
    const participantCount = await getParticipantCount(contest._id);
    const status = getRuntimeStatus(contest);

    let rankExtras = {};
    if (req.user?.id && registered && status === "completed") {
      await gradeAllPendingForContest(contest._id);
      const leaderboard = await buildLeaderboard(
        contest._id,
        contest.startTime,
      );
      const me = leaderboard.find((row) => row.userId === req.user.id);
      if (me) {
        rankExtras = {
          myRank: me.rank,
          myScore: me.totalScore,
        };
      }
    }

    res.status(200).json({
      success: true,
      data: publicContestSummary(
        contest,
        {
          participantCount,
          registered,
          ...rankExtras,
        },
        req.user?.id,
      ),
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const registerForContest = async (req, res, next) => {
  try {
    const contestId = toObjectId(req.params.id);
    if (!contestId) {
      return res.status(400).json({
        success: false,
        message: "Invalid contest id",
      });
    }

    const contest = await Contest.findById(contestId).select("+joinCodeHash");
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const now = new Date();
    if (now > new Date(contest.endTime)) {
      return res.status(400).json({
        success: false,
        message: "Registration is closed for this contest",
      });
    }

    const visibility = contest.visibility ?? "public";
    if (visibility === "private") {
      const joinCode = req.body?.joinCode;
      const valid = await verifyJoinCode(joinCode, contest.joinCodeHash);
      if (!valid) {
        const failKey = `join-fail:${req.user.id}:${contestId.toString()}`;
        if (
          !consumeRateLimit(failKey, {
            windowMs: 15 * 60 * 1000,
            max: 10,
          })
        ) {
          return res.status(429).json({
            success: false,
            message:
              "Too many incorrect join attempts. Try again in a few minutes.",
          });
        }
        return res.status(403).json({
          success: false,
          message: "Invalid join code for this private contest",
        });
      }
    }

    if (contest.maxParticipants) {
      const count = await getParticipantCount(contestId);
      if (count >= contest.maxParticipants) {
        return res.status(409).json({
          success: false,
          message: `Contest is full (${count}/${contest.maxParticipants} registered)`,
        });
      }
    }

    try {
      await ContestRegistration.create({
        contestId,
        userId: req.user.id,
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "You are already registered for this contest",
        });
      }
      throw err;
    }

    res.status(201).json({
      success: true,
      message: "Registered successfully",
      data: {
        contestId: contestId.toString(),
        registeredAt: new Date().toISOString(),
      },
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const getContestAttempt = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const status = getRuntimeStatus(contest);
    if (status !== "live") {
      return res.status(403).json({
        success: false,
        message: "Contest attempt is only available while the contest is live",
      });
    }

    const registration = await getRegistrationRecord(
      contest._id,
      req.user.id,
    );
    if (!registration) {
      return res.status(403).json({
        success: false,
        message: "Register for the contest before attempting",
      });
    }

    const sections = (contest.sections ?? []).map((section) => ({
      sectionKey: section.sectionKey,
      type: section.type,
      name: section.name,
      marksPerQuestion: section.marksPerQuestion,
      questions: (section.questions ?? []).map((question) => ({
        questionKey: question.questionKey,
        source: question.source,
        snapshot: sanitizeSnapshotForAttempt(question.snapshot),
      })),
    }));

    res.status(200).json({
      success: true,
      data: {
        contestId: contest._id.toString(),
        title: contest.title,
        endTime: contest.endTime,
        status,
        examFinalized: Boolean(registration.examFinalizedAt),
        examFinalizedAt: registration.examFinalizedAt,
        sections,
      },
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const runContestDsaCode = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const registration = await getRegistrationRecord(
      contest._id,
      req.user.id,
    );
    if (!registration) {
      return res.status(403).json({
        success: false,
        message: "Register for the contest before running code",
      });
    }

    try {
      await assertCanEditAnswers(contest, registration);
    } catch (err) {
      return res.status(403).json({ success: false, message: err.message });
    }

    const questionKey = String(req.body?.questionKey ?? "").trim();
    if (!questionKey) {
      return res.status(400).json({
        success: false,
        message: "questionKey is required",
      });
    }

    const match = findContestQuestion(contest, questionKey);
    if (!match || match.section.type !== "DSA") {
      return res.status(400).json({
        success: false,
        message: "Run is only available for DSA questions in this contest",
      });
    }

    const snapshot = match.question.snapshot;
    const slug = snapshot?.slug;
    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "This question cannot be run (missing problem reference)",
      });
    }

    const { code, languageId } = req.body;
    try {
      const result = await runCodeOnExampleCases({
        slug,
        code,
        languageId,
        exampleTestCases: snapshot.example_test_cases,
        examples: snapshot.examples,
      });
      res.status(200).json({
        success: true,
        data: result,
        ...serverTimePayload(),
      });
    } catch (err) {
      const status = err.status ?? 500;
      return res.status(status).json({
        success: false,
        message: err.message ?? "Run failed",
      });
    }
  } catch (err) {
    next(err);
  }
};

export const saveContestAnswer = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const registration = await getRegistrationRecord(
      contest._id,
      req.user.id,
    );
    if (!registration) {
      return res.status(403).json({
        success: false,
        message: "Register for the contest before saving answers",
      });
    }

    try {
      await assertCanEditAnswers(contest, registration);
    } catch (err) {
      return res.status(403).json({ success: false, message: err.message });
    }

    const questionKey = String(req.body?.questionKey ?? "").trim();
    if (!questionKey) {
      return res.status(400).json({
        success: false,
        message: "questionKey is required",
      });
    }

    try {
      await saveContestAnswerDraft({
        contest,
        userId: req.user.id,
        questionKey,
        body: req.body,
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    res.status(200).json({
      success: true,
      data: { questionKey, saved: true },
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const finalizeContestExam = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const status = getRuntimeStatus(contest);
    if (status !== "live") {
      return res.status(403).json({
        success: false,
        message: "Final submission is only allowed while the contest is live",
      });
    }

    const registration = await getRegistrationRecord(
      contest._id,
      req.user.id,
    );
    if (!registration) {
      return res.status(403).json({
        success: false,
        message: "Register for the contest before submitting",
      });
    }

    if (registration.examFinalizedAt) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted your answers",
      });
    }

    const questionKey = String(req.body?.questionKey ?? "").trim();
    if (questionKey) {
      const match = findContestQuestion(contest, questionKey);
      const hasDraftPayload =
        match &&
        (match.section.type === "DSA"
          ? Boolean(
              req.body?.code &&
                typeof req.body.code === "string" &&
                req.body?.languageId,
            )
          : Number.isInteger(req.body?.selectedIndex) &&
            req.body.selectedIndex >= 0);
      if (hasDraftPayload) {
        try {
          const draftBody =
            match.section.type === "DSA"
              ? { ...req.body, submitDsaAnswer: true }
              : req.body;
          await saveContestAnswerDraft({
            contest,
            userId: req.user.id,
            questionKey,
            body: draftBody,
          });
        } catch (err) {
          return res.status(400).json({ success: false, message: err.message });
        }
      }
    }

    await finalizeUserExam(contest, req.user.id);

    res.status(200).json({
      success: true,
      message:
        "Your answers are submitted. Results will be available after the contest ends.",
      data: { examFinalized: true },
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const getMyContestSubmissions = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const registration = await getRegistrationRecord(
      contest._id,
      req.user.id,
    );
    if (!registration) {
      return res.status(403).json({
        success: false,
        message: "Register for the contest to view submissions",
      });
    }

    const runtimeStatus = getRuntimeStatus(contest);
    const showResults = runtimeStatus === "completed";

    if (showResults) {
      await gradeAllPendingForContest(contest._id);
    }

    const submissions = await ContestSubmission.find({
      contestId: contest._id,
      userId: req.user.id,
    }).select(
      "questionKey sectionKey sectionType isCorrect marksAwarded submittedAt selectedIndex code languageId graded lastSavedAt dsaAnswerSubmittedAt",
    );

    const data = buildOrderedResultRows(contest, submissions, {
      includeScores: showResults,
    });

    res.status(200).json({
      success: true,
      data,
      examFinalized: Boolean(registration.examFinalizedAt),
      resultsVisible: showResults,
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const getContestLeaderboard = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const status = getRuntimeStatus(contest);
    if (status !== "completed") {
      return res.status(403).json({
        success: false,
        message: "Leaderboard is available after the contest ends",
      });
    }

    await gradeAllPendingForContest(contest._id);
    const leaderboard = await buildLeaderboard(contest._id, contest.startTime);
    const sectionColumns = (contest.sections ?? []).map((section) => ({
      sectionKey: section.sectionKey,
      name: section.name,
      type: section.type,
    }));

    res.status(200).json({
      success: true,
      data: leaderboard,
      sectionColumns,
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};
