import Problem from '../models/problem.js';

export const getProblems = async (req, res) => {
  try {
    const problems = await Problem.find(
      {},
      'slug title difficulty' // projection: only send what the list view needs
    ).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: problems.length,
      data: problems
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
