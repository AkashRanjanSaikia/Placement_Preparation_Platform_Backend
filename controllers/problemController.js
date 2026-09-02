import Problem from '../models/problems.js';

export const getProblems = async (req, res) => {
  try {
    const problems = await Problem.find(
      {},
      'id title difficulty' // projection: only send what the list view needs
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

export const getProblemById = async (req, res) => {
  try {
    const { id } = req.params;

    const problem = await Problem.findOne({ id }).select(
      '-test_cases'
    );

    if (!problem) {
      return res.status(404).json({
        success: false,
        message: `Problem '${id}' not found`
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
