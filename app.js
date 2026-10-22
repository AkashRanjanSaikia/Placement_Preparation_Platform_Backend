import express from 'express' ;
import cors from 'cors'
import 'dotenv/config';
import connectDB  from './config/db.js';
import errorHandler from './middleware/errorHandler.js';
import problemRouter from './routes/problem.js';
import submissionRouter from './routes/submission.js';
import questionRouter from './routes/question.js';
import authRouter from './routes/auth.js';

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

app.use("/problem", problemRouter);
app.use("/submission",submissionRouter);
app.use("/question", questionRouter);
app.use("/auth", authRouter);

//  path not present
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);      // for other errors 

//  function to start the server
const startServer = async () => {
    try {
        await connectDB();  // Start the database connection
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();
