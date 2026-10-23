import mongoose from "mongoose";
import Contest from "../models/contest.js";
import ContestRegistration from "../models/contestRegistration.js";
import ContestSubmission from "../models/contestSubmission.js";
import {
  getRuntimeStatus,
  serverTimePayload,
} from "../utility/contestStatus.js";
import {
  findContestQuestion,
  sanitizeSnapshotForAttempt,
} from "../services/contestSnapshotService.js";
import {
  gradeDsaAnswer,
  gradeMcqAnswer,
} from "../services/contestGradingService.js";
import { buildLeaderboard } from "../services/leaderboardService.js";
import { verifyJoinCode } from "../services/joinCodeService.js";

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

    res.status(200).json({
      success: true,
      data: publicContestSummary(
        contest,
        {
          participantCount,
          registered,
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
          message: "Contest has reached maximum participants",
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

    const registered = await isUserRegistered(contest._id, req.user.id);
    if (!registered) {
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
        sections,
      },
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const submitContestAnswer = async (req, res, next) => {
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
        message: "Submissions are only accepted while the contest is live",
      });
    }

    const registered = await isUserRegistered(contest._id, req.user.id);
    if (!registered) {
      return res.status(403).json({
        success: false,
        message: "Register for the contest before submitting",
      });
    }

    const questionKey = String(req.body?.questionKey ?? "").trim();
    if (!questionKey) {
      return res.status(400).json({
        success: false,
        message: "questionKey is required",
      });
    }

    const match = findContestQuestion(contest, questionKey);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Question not found in this contest",
      });
    }

    const { section, question } = match;
    const snapshot = question.snapshot;
    let gradingResult;

    if (section.type === "DSA") {
      gradingResult = await gradeDsaAnswer(
        snapshot,
        req.body?.code,
        Number(req.body?.languageId),
      );
    } else {
      gradingResult = gradeMcqAnswer(snapshot, Number(req.body?.selectedIndex));
    }

    const marksAwarded = gradingResult.isCorrect
      ? section.marksPerQuestion
      : 0;

    const submission = await ContestSubmission.findOneAndUpdate(
      {
        contestId: contest._id,
        userId: req.user.id,
        questionKey,
      },
      {
        contestId: contest._id,
        userId: req.user.id,
        questionKey,
        sectionKey: section.sectionKey,
        sectionType: section.type,
        selectedIndex:
          section.type === "DSA" ? undefined : Number(req.body?.selectedIndex),
        code: section.type === "DSA" ? req.body?.code : undefined,
        languageId:
          section.type === "DSA" ? Number(req.body?.languageId) : undefined,
        isCorrect: gradingResult.isCorrect,
        marksAwarded,
        submittedAt: new Date(),
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    res.status(200).json({
      success: true,
      data: {
        questionKey,
        isCorrect: submission.isCorrect,
        marksAwarded: submission.marksAwarded,
        submittedAt: submission.submittedAt,
        ...(section.type === "DSA" && gradingResult.verdicts
          ? { verdicts: gradingResult.verdicts }
          : {}),
      },
      ...serverTimePayload(),
    });
  } catch (err) {
    if (
      err.message?.includes("required") ||
      err.message?.includes("Unsupported") ||
      err.message?.includes("No harness")
    ) {
      return res.status(400).json({ success: false, message: err.message });
    }
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

    const registered = await isUserRegistered(contest._id, req.user.id);
    if (!registered) {
      return res.status(403).json({
        success: false,
        message: "Register for the contest to view submissions",
      });
    }

    const submissions = await ContestSubmission.find({
      contestId: contest._id,
      userId: req.user.id,
    }).select(
      "questionKey sectionKey isCorrect marksAwarded submittedAt selectedIndex languageId",
    );

    res.status(200).json({
      success: true,
      data: submissions,
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

    const leaderboard = await buildLeaderboard(contest._id, contest.startTime);

    res.status(200).json({
      success: true,
      data: leaderboard,
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};
