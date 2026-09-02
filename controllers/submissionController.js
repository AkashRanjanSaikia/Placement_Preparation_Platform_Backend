import Problem from '../models/problems.js';
import Template from '../models/Template.js';
import axios from 'axios';
import 'dotenv/config';

const JUDGE0_URL = process.env.JUDGE0_URL;

const languageIdToName = {
  71: 'python',
  63: 'javascript',
  62: 'java',
};

export const runSubmission = async (req, res) => {
  try {
    const { problemId, code, languageId } = req.body;

    if (!problemId) {
      return res.status(400).json({ error: 'problemId is required' });
    }
    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }
    if (!languageId) {
      return res.status(400).json({ error: 'languageId is required' });
    }

    const problem = await Problem.findOne({id : problemId});
    const template = await Template.findOne({problem_id : problemId, language : languageIdToName[languageId]});

    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const fullCode = template.harness_template.replace('{{USER_CODE}}', code);

    const response = await axios.post(
      `${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`,
      {
        source_code: fullCode,
        language_id: languageId || 71, // Python 3
        stdin: '2,7,11,15\n9',
        expected_output: '0,1',
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(response.data);

    res.json(response.data);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};