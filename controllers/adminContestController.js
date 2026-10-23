import Contest from "../models/contest.js";
import Problem from "../models/problem.js";
import Question from "../models/question.js";
import {
  createContestDraft,
  publishContestDraft,
  updateContestDraft,
} from "../services/contestDraftService.js";
import {
  getRuntimeStatus,
  serverTimePayload,
} from "../utility/contestStatus.js";

function handleServiceError(err, res, next) {
  if (err.message) {
    return res.status(400).json({ success: false, message: err.message });
  }
  return next(err);
}

export const createContest = async (req, res, next) => {
  try {
    const contest = await createContestDraft({
      body: { ...req.body, visibility: "public" },
      createdBy: null,
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

export const updateContest = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const updated = await updateContestDraft({
      contest,
      body: { ...req.body, visibility: "public" },
    });

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

export const publishContest = async (req, res, next) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({
        success: false,
        message: "Contest not found",
      });
    }

    const result = await publishContestDraft(contest);

    res.status(200).json({
      success: true,
      data: {
        contest: result.contest,
        status: result.status,
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

export const browseContestLibrary = async (req, res, next) => {
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

export const listAdminContests = async (req, res, next) => {
  try {
    const contests = await Contest.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: contests.map((contest) => ({
        contest,
        status: getRuntimeStatus(contest),
      })),
      ...serverTimePayload(),
    });
  } catch (err) {
    next(err);
  }
};
