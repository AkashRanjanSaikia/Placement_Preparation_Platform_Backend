import mongoose from "mongoose";
import Contest from "../models/contest.js";
import ContestRegistration from "../models/contestRegistration.js";
import ContestSubmission from "../models/contestSubmission.js";
import {
  contestClosedReason,
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
import { isContestDeleted } from "../services/contestHostLifecycleService.js";

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
  const hostId = contestHostId(contest);

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
    hostStoppedAt: contest.hostStoppedAt ?? null,
    closedReason: contestClosedReason(contest),
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

function contestHostId(contest) {
  return contest.createdBy?._id
    ? contest.createdBy._id.toString()
    : contest.createdBy?.toString?.() ?? null;
}

function contestIsHost(contest, userId) {
  if (!userId) return false;
  const hostId = contestHostId(contest);
  return Boolean(hostId && hostId === userId);
}

function registrationViewerFlags(registration, contestStatus) {
  if (!registration) {
    return {
      registered: false,
      examFinalized: false,
      roomLocked: false,
      canEnterRoom: false,
    };
  }
  const examFinalized = Boolean(registration.examFinalizedAt);
  const roomLocked = Boolean(
    registration.roomLockedAt || registration.examFinalizedAt,
  );
  const canEnterRoom = contestStatus === "live" && !roomLocked;
  return {
    registered: true,
    examFinalized,
    roomLocked,
    canEnterRoom,
  };
}

/** Hosts may open the room before start and during the contest; not subject to participant lock-out. */
function applyHostRoomAccess(regFlags, contest, contestStatus, userId) {
  if (isContestDeleted(contest) || contest.hostStoppedAt) {
    return { ...regFlags, canEnterRoom: false };
  }
  if (!contestIsHost(contest, userId)) {
    return regFlags;
  }
  if (contestStatus === "completed") {
    return { ...regFlags, canEnterRoom: false };
  }
  return {
    ...regFlags,
    canEnterRoom: true,
    roomLocked: false,
  };
}

function canRegisterForContest(contest, now, alreadyRegistered) {
  if (alreadyRegistered) return false;
  if (isContestDeleted(contest) || contest.hostStoppedAt) return false;
  if (now > new Date(contest.endTime)) return false;
  if (now >= new Date(contest.startTime)) return false;
  return true;
}

function publishedVisibleFilter(extra = {}) {
  return { published: true, deletedAt: null, ...extra };
}

function buildStatusFilter(status, now) {
  if (!status) {
    return publishedVisibleFilter();
  }

  const normalized = String(status).toLowerCase();
  if (normalized === "upcoming") {
    return publishedVisibleFilter({ startTime: { $gt: now } });
  }
  if (normalized === "live") {
    return publishedVisibleFilter({
      startTime: { $lte: now },
      endTime: { $gte: now },
      hostStoppedAt: null,
    });
  }
  if (normalized === "completed") {
    return publishedVisibleFilter({
      $or: [{ endTime: { $lt: now } }, { hostStoppedAt: { $ne: null } }],
    });
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
      .sort({ startTime: -1 });
    const contestIds = contests.map((contest) => contest._id);

    const registrationCounts = await ContestRegistration.aggregate([
      { $match: { contestId: { $in: contestIds } } },
      { $group: { _id: "$contestId", count: { $sum: 1 } } },
    ]);
    const countByContest = new Map(
      registrationCounts.map((row) => [row._id.toString(), row.count]),
    );

    const registrationByContest = new Map();
    if (req.user?.id && contestIds.length) {
      const registrations = await ContestRegistration.find({
        contestId: { $in: contestIds },
        userId: req.user.id,
      }).select("contestId examFinalizedAt roomLockedAt roomEnteredAt");
      for (const row of registrations) {
        registrationByContest.set(row.contestId.toString(), row);
      }
    }

    res.status(200).json({
      success: true,
      data: contests.map((contest) => {
        const reg = registrationByContest.get(contest._id.toString());
        const status = getRuntimeStatus(contest);
        const regFlags = applyHostRoomAccess(
          registrationViewerFlags(reg, status),
          contest,
          status,
          req.user?.id,
        );
        return publicContestSummary(
          contest,
          {
            participantCount: countByContest.get(contest._id.toString()) ?? 0,
            ...regFlags,
            canRegister: canRegisterForContest(
              contest,
              now,
              regFlags.registered,
            ),
          },
          req.user?.id,
        );
      }),
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
    if (!contest || !contest.published || isContestDeleted(contest)) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const status = getRuntimeStatus(contest);
    const registration = req.user?.id
      ? await getRegistrationRecord(contest._id, req.user.id)
      : null;
    const regFlags = applyHostRoomAccess(
      registrationViewerFlags(registration, status),
      contest,
      status,
      req.user?.id,
    );
    const participantCount = await getParticipantCount(contest._id);
    const now = new Date();

    let rankExtras = {};
    if (req.user?.id && regFlags.registered && status === "completed") {
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
          ...regFlags,
          canRegister: canRegisterForContest(
            contest,
            now,
            regFlags.registered,
          ),
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
    if (!contest || !contest.published || isContestDeleted(contest)) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    if (contest.hostStoppedAt) {
      return res.status(400).json({
        success: false,
        message: "This contest was ended by the host",
      });
    }

    const now = new Date();
    if (now > new Date(contest.endTime)) {
      return res.status(400).json({
        success: false,
        message: "Registration is closed for this contest",
      });
    }
    if (now >= new Date(contest.startTime)) {
      return res.status(400).json({
        success: false,
        message: "Registration closes when the contest starts",
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

    if (isContestDeleted(contest)) {
      return res.status(410).json({
        success: false,
        code: "CONTEST_REMOVED",
        message: "This contest was removed by the host",
      });
    }

    const status = getRuntimeStatus(contest);
    const isHost = contestIsHost(contest, req.user.id);

    if (contest.hostStoppedAt && !isHost) {
      return res.status(403).json({
        success: false,
        code: "CONTEST_STOPPED",
        message: "The host ended this contest",
      });
    }

    if (status === "completed") {
      return res.status(403).json({
        success: false,
        message: "This contest has ended",
      });
    }

    if (!isHost && status !== "live") {
      return res.status(403).json({
        success: false,
        message: "Contest attempt is only available while the contest is live",
      });
    }

    if (isHost && status !== "live" && status !== "upcoming") {
      return res.status(403).json({
        success: false,
        message: "Contest room is not available",
      });
    }

    const registration = await getRegistrationRecord(
      contest._id,
      req.user.id,
    );

    if (!isHost) {
      if (!registration) {
        return res.status(403).json({
          success: false,
          message: "Register for the contest before attempting",
        });
      }

      if (registration.roomLockedAt || registration.examFinalizedAt) {
        return res.status(403).json({
          success: false,
          message:
            "You have already submitted or left this contest — you cannot re-enter the room",
        });
      }

      if (!registration.roomEnteredAt) {
        registration.roomEnteredAt = new Date();
        await registration.save();
      }
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
        examFinalized: Boolean(registration?.examFinalizedAt),
        examFinalizedAt: registration?.examFinalizedAt ?? null,
        isHostPreview: isHost,
        closedReason: contestClosedReason(contest),
        sections,
      },
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const getContestLiveState = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id).select(
      "published startTime endTime hostStoppedAt deletedAt",
    );
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    if (isContestDeleted(contest)) {
      return res.status(410).json({
        success: false,
        code: "CONTEST_REMOVED",
        message: "This contest was removed by the host",
      });
    }

    const status = getRuntimeStatus(contest);
    res.status(200).json({
      success: true,
      data: {
        status,
        endTime: contest.endTime,
        hostStoppedAt: contest.hostStoppedAt,
        closedReason: contestClosedReason(contest),
      },
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const lockContestRoom = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest || !contest.published) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    if (contestIsHost(contest, req.user.id)) {
      return res.status(200).json({
        success: true,
        data: { roomLocked: false },
        ...serverTimePayload(),
      });
    }

    const registration = await getRegistrationRecord(
      contest._id,
      req.user.id,
    );
    if (!registration) {
      return res.status(403).json({
        success: false,
        message: "Register for the contest first",
      });
    }

    if (!registration.roomEnteredAt || registration.examFinalizedAt) {
      return res.status(200).json({
        success: true,
        data: { roomLocked: Boolean(registration.roomLockedAt) },
      });
    }

    if (!registration.roomLockedAt) {
      registration.roomLockedAt = new Date();
      await registration.save();
    }

    res.status(200).json({
      success: true,
      data: { roomLocked: true },
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
    const isHost = contestIsHost(contest, req.user.id);

    if (!registration && !isHost) {
      return res.status(403).json({
        success: false,
        message: "Register for the contest to view submissions",
      });
    }

    if (!registration && isHost) {
      return res.status(200).json({
        success: true,
        data: [],
        ...serverTimePayload(),
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
