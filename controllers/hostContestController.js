import Contest from "../models/contest.js";
import ContestRegistration from "../models/contestRegistration.js";
import Problem from "../models/problem.js";
import Question from "../models/question.js";
import {
  buildEditableSections,
  countQuestionsInSections,
} from "../services/hostContestMapper.js";
import { isContestDraftEditable } from "../utility/contestStatus.js";
import {
  assertContestOwner,
  createContestDraft,
  publishContestDraft,
  regeneratePrivateJoinCode,
  updateContestDraft,
} from "../services/contestDraftService.js";
import {
  getRuntimeStatus,
  serverTimePayload,
} from "../utility/contestStatus.js";
import {
  deleteContestByHost,
  stopContestByHost,
} from "../services/contestHostLifecycleService.js";

const MAX_DRAFTS_PER_USER = 20;

function handleServiceError(err, res, next) {
  if (
    err.message &&
    (err.message.includes("required") ||
      err.message.includes("must") ||
      err.message.includes("Only") ||
      err.message.includes("already") ||
      err.message.includes("visibility") ||
      err.message.includes("confirm") ||
      err.message.includes("Confirmation") ||
      err.message.includes("deleted") ||
      err.message.includes("stopped") ||
      err.message.includes("ended") ||
      err.message.includes("removed"))
  ) {
    return res.status(400).json({ success: false, message: err.message });
  }
  return next(err);
}

export const hostCreateContest = async (req, res, next) => {
  try {
    const draftCount = await Contest.countDocuments({
      createdBy: req.user.id,
      published: false,
    });
    if (draftCount >= MAX_DRAFTS_PER_USER) {
      return res.status(400).json({
        success: false,
        message: "Too many unpublished drafts. Publish or delete old drafts first.",
      });
    }

    const contest = await createContestDraft({
      body: req.body,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: {
        contest,
        status: getRuntimeStatus(contest),
        ...serverTimePayload(),
      },
    });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

export const hostUpdateContest = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }
    if (!assertContestOwner(contest, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only edit contests you created",
      });
    }

    const updated = await updateContestDraft({ contest, body: req.body });
    res.status(200).json({
      success: true,
      data: {
        contest: updated,
        status: getRuntimeStatus(updated),
        ...serverTimePayload(),
      },
    });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

export const hostPublishContest = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }
    if (!assertContestOwner(contest, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only publish contests you created",
      });
    }

    const result = await publishContestDraft(contest);
    res.status(200).json({
      success: true,
      data: {
        contest: result.contest,
        status: result.status,
        joinCode:
          result.joinCodePlain != null ? result.joinCodePlain : undefined,
        ...serverTimePayload(),
      },
    });
  } catch (err) {
    if (err.message?.includes("not found") || err.message?.includes("requires")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    handleServiceError(err, res, next);
  }
};

export const hostRegenerateJoinCode = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id).select(
      "+joinCodeHash",
    );
    if (!contest) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }
    if (!assertContestOwner(contest, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Only the host can regenerate the join code",
      });
    }

    const result = await regeneratePrivateJoinCode(contest);
    res.status(200).json({
      success: true,
      data: {
        contestId: result.contest._id.toString(),
        joinCode: result.joinCodePlain,
      },
      ...serverTimePayload(),
    });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

export const hostListMyContests = async (req, res, next) => {
  try {
    const contests = await Contest.find({ createdBy: req.user.id }).sort({
      updatedAt: -1,
    });
    const contestIds = contests.map((c) => c._id);
    const registrationCounts = await ContestRegistration.aggregate([
      { $match: { contestId: { $in: contestIds } } },
      { $group: { _id: "$contestId", count: { $sum: 1 } } },
    ]);
    const countByContest = new Map(
      registrationCounts.map((row) => [row._id.toString(), row.count]),
    );

    res.status(200).json({
      success: true,
      data: contests.map((contest) => ({
        id: contest._id.toString(),
        title: contest.title,
        visibility: contest.visibility ?? "public",
        published: contest.published,
        status: getRuntimeStatus(contest),
        startTime: contest.startTime,
        endTime: contest.endTime,
        updatedAt: contest.updatedAt,
        sectionCount: contest.sections?.length ?? 0,
        questionCount: countQuestionsInSections(contest.sections),
        participantCount: countByContest.get(contest._id.toString()) ?? 0,
      })),
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const hostGetContest = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }
    if (!assertContestOwner(contest, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only manage contests you created",
      });
    }

    const participantCount = await ContestRegistration.countDocuments({
      contestId: contest._id,
    });
    const editableSections = await buildEditableSections(contest.sections);

    res.status(200).json({
      success: true,
      data: {
        id: contest._id.toString(),
        title: contest.title,
        description: contest.description,
        rules: contest.rules,
        visibility: contest.visibility ?? "public",
        published: contest.published,
        publishedAt: contest.publishedAt,
        status: getRuntimeStatus(contest),
        startTime: contest.startTime,
        endTime: contest.endTime,
        maxParticipants: contest.maxParticipants,
        participantCount,
        sectionCount: contest.sections?.length ?? 0,
        questionCount: countQuestionsInSections(contest.sections),
        canEdit: isContestDraftEditable(contest),
        hostStoppedAt: contest.hostStoppedAt,
        deletedAt: contest.deletedAt,
        editableSections,
      },
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};

export const hostStopContest = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }
    if (!assertContestOwner(contest, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Only the host can stop this contest",
      });
    }

    const updated = await stopContestByHost(contest);
    res.status(200).json({
      success: true,
      message:
        "Contest stopped. Participants in the room will be closed out safely.",
      data: {
        id: updated._id.toString(),
        status: getRuntimeStatus(updated),
        hostStoppedAt: updated.hostStoppedAt,
        endTime: updated.endTime,
      },
      ...serverTimePayload(),
    });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

export const hostDeleteContest = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }
    if (!assertContestOwner(contest, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete contests you created",
      });
    }

    const result = await deleteContestByHost(
      contest,
      req.body?.confirmTitle,
    );

    res.status(200).json({
      success: true,
      message:
        result.mode === "hard"
          ? "Draft deleted"
          : "Contest removed. It no longer appears to students.",
    });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

export const hostBrowseLibrary = async (req, res, next) => {
  try {
    const type = String(req.query?.type ?? "").toUpperCase();
    const page = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(req.query?.limit, 10) || 20),
    );
    const skip = (page - 1) * limit;
    const search = String(req.query?.search ?? "").trim();
    const difficulty = String(req.query?.difficulty ?? "").trim();

    if (type === "DSA") {
      const filter = {};
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: "i" } },
          { slug: { $regex: search, $options: "i" } },
        ];
      }
      if (["Easy", "Medium", "Hard"].includes(difficulty)) {
        filter.difficulty = difficulty;
      }

      const [items, total] = await Promise.all([
        Problem.find(filter)
          .select("slug title difficulty description")
          .sort({ title: 1 })
          .skip(skip)
          .limit(limit),
        Problem.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        type,
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        data: items.map((item) => ({
          model: "Problem",
          id: item._id,
          slug: item.slug,
          title: item.title,
          difficulty: item.difficulty,
          description: item.description,
        })),
        ...serverTimePayload(),
      });
    }

    if (type === "APTITUDE" || type === "CORE_CS") {
      const category = type === "APTITUDE" ? "aptitude" : "core_cs";
      const filter = { category };
      if (search) {
        filter.$or = [
          { questionText: { $regex: search, $options: "i" } },
          { topic: { $regex: search, $options: "i" } },
        ];
      }
      if (["easy", "medium", "hard"].includes(difficulty.toLowerCase())) {
        filter.difficulty = difficulty.toLowerCase();
      }
      const { topic, subject } = req.query;
      if (topic) filter.topic = topic;
      if (subject) filter.subject = subject;

      const [items, total] = await Promise.all([
        Question.find(filter)
          .select("-correctAnswers")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Question.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        type,
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        data: items.map((item) => ({
          model: "Question",
          id: item._id,
          questionText: item.questionText,
          topic: item.topic,
          subject: item.subject,
          difficulty: item.difficulty,
        })),
        ...serverTimePayload(),
      });
    }

    return res.status(400).json({
      success: false,
      message: "Query param type must be DSA, APTITUDE, or CORE_CS",
    });
  } catch (err) {
    next(err);
  }
};
