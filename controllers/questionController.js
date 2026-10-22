import Question from "../models/question.js";

const VALID_CATEGORIES = ["aptitude", "core_cs"];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export const getQuestionCatalog = async (req, res) => {
  try {
    const { category } = req.query;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Query param 'category' is required",
      });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
      });
    }

    const [grouped, byDifficulty] = await Promise.all([
      Question.aggregate([
        { $match: { category } },
        {
          $group: {
            _id: { subject: "$subject", topic: "$topic" },
            count: { $sum: 1 },
          },
        },
      ]),
      Question.aggregate([
        { $match: { category } },
        {
          $group: {
            _id: { topic: "$topic", difficulty: "$difficulty" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const topicCounts = {};
    const subjects = {};
    const topicDifficultyCounts = {};

    for (const row of grouped) {
      const subject = row._id.subject;
      const topic = row._id.topic;
      const count = row.count;

      if (topic) {
        topicCounts[topic] = count;
      }

      if (subject) {
        subjects[subject] = (subjects[subject] ?? 0) + count;
      }
    }

    for (const row of byDifficulty) {
      const topic = row._id.topic;
      const difficulty = row._id.difficulty;
      if (!topic || !difficulty) continue;

      if (!topicDifficultyCounts[topic]) {
        topicDifficultyCounts[topic] = { easy: 0, medium: 0, hard: 0 };
      }
      if (topicDifficultyCounts[topic][difficulty] !== undefined) {
        topicDifficultyCounts[topic][difficulty] = row.count;
      }
    }

    res.status(200).json({
      success: true,
      category,
      topicCounts,
      topicDifficultyCounts,
      subjects,
    });
  } catch (err) {
    console.error("Error fetching question catalog:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch question catalog",
    });
  }
};

export const getQuestions = async (req, res) => {
  try {
    const { category, subject } = req.query;

    if (!category || !subject) {
      return res.status(400).json({
        success: false,
        message: "Query params 'category' and 'subject' are required",
      });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || DEFAULT_PAGE);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT),
    );
    const skip = (page - 1) * limit;

    const filter = {
      category,
      subject,
    };

    const { topic, difficulty } = req.query;
    if (topic && topic !== "all-topics") {
      filter.topic = topic;
    }

    const normalizedDifficulty = String(difficulty ?? "").toLowerCase();
    if (["easy", "medium", "hard"].includes(normalizedDifficulty)) {
      filter.difficulty = normalizedDifficulty;
    }

    const [questions, total] = await Promise.all([
      Question.find(filter)
        .select("-correctAnswers")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit),
      Question.countDocuments(filter),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages,
      count: questions.length,
      data: questions,
    });
  } catch (err) {
    console.error("Error fetching questions:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch questions",
    });
  }
};

export const checkQuestionAnswer = async (req, res) => {
  try {
    const { id } = req.params;
    const selectedIndex = Number(req.body?.selectedIndex);

    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      return res.status(400).json({
        success: false,
        message: "Body field 'selectedIndex' must be a non-negative integer",
      });
    }

    const question = await Question.findById(id).select(
      "correctAnswers explanation questionType",
    );

    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    const correct = question.correctAnswers?.includes(selectedIndex) ?? false;

    res.status(200).json({
      success: true,
      correct,
      explanation: correct ? question.explanation : undefined,
    });
  } catch (err) {
    console.error("Error checking answer:", err);
    res.status(500).json({
      success: false,
      message: "Failed to check answer",
    });
  }
};
