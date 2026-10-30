import Problem from '../models/problem.js';
import { getAcceptanceRatesBySlug } from '../services/dsaSubmissionService.js';

export const getProblems = async (req, res) => {
  try {
    const [problems, acceptanceBySlug] = await Promise.all([
      Problem.find(
        {},
        'slug title difficulty',
      ).sort({ createdAt: 1 }),
      getAcceptanceRatesBySlug(),
    ]);

    const data = problems.map((problem) => ({
      ...problem.toObject(),
      acceptance: acceptanceBySlug[problem.slug] ?? '—',
    }));

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error('Error fetching problems:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch problems'
    });
  }
};

export const getProblemBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const problem = await Problem.findOne({ slug }).select(
      '-test_cases'
    );

    if (!problem) {
      return res.status(404).json({
        success: false,
        message: `Problem '${slug}' not found`
      });
    }

    res.status(200).json({
      success: true,
      data: problem
    });
  } catch (err) {
    console.error('Error fetching problem:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch problem'
    });
  }
};
