# Project overview and setup

***

# Project Overview

This is a **Node.js + Express backend** for a **coding interview / placement platform** (similar to LeetCode). It serves coding problems from MongoDB and can send user code to a **Judge0** server for execution.

```
┌─────────────┐     HTTP API      ┌──────────────────┐     Mongoose     ┌─────────────┐
│   Frontend  │ ────────────────► │  Express (app.js)│ ───────────────► │   MongoDB   │
│(not here)   │                   │   Port 5000      │                  │  (problems) │
└─────────────┘                   └────────┬─────────┘                  └─────────────┘
                                           │
                                           │ axios POST
                                           ▼
                                  ┌──────────────────┐
                                  │  Judge0 API      │
                                  │  (code runner)   │
                                  └──────────────────┘
```

***

## Tech Stack

| Layer          | Technology                                |
| -------------- | ----------------------------------------- |
| Runtime        | Node.js (ES modules — `"type": "module"`) |
| Framework      | Express 5                                 |
| Database       | MongoDB via Mongoose                      |
| Code execution | Judge0 (remote HTTP API)                  |
| Config         | `dotenv` (`.env` file)                    |
| CORS           | Enabled for frontend access               |

***

## Project Structure

```
Backend/
├── app.js                      # Entry point — starts server, mounts routes
├── config/db.js                # MongoDB connection
├── controllers/
│   ├── problemController.js    # Fetch problems
│   └── submissionController.js # Submit code to Judge0
├── routes/
│   ├── problem.js              # GET /problem
│   └── submission.js           # POST /submission
├── models/
│   ├── problems.js             # Problem schema (Mongoose)
│   └── upload.js               # Seed script — populates DB with sample problems
├── middleware/errorHandler.js  # Global error handler
├── .env                        # PORT, MONGODB_URI, JUDGE0_URL
└── package.json
```

***

## How It Works (Step by Step)

### 1. Server startup (`app.js`)

On start:

1. Loads environment variables from `.env`
2. Connects to MongoDB (`config/db.js`)
3. Starts Express on port `5000` (or `PORT` from `.env`)
4. Mounts two route groups:
   - `/problem` → problem routes
   - `/submission` → submission routes
5. Returns `404` for unknown routes
6. Uses a global error handler for uncaught errors

### 2. Problem model (`models/problems.js`)

Each problem in MongoDB looks like:

- `id` — slug, e.g. `"two-sum"`
- `title`, `difficulty`, `description`, `constraints`
- `function_name` — expected function name, e.g. `two_sum`
- `params` — function parameters, e.g. `["nums", "target"]`
- `examples` — visible sample I/O
- `test_cases` — hidden + visible test cases with `args`, `expected`, `hidden`

### 3. Problem APIs (`/problem`)

| Method | Endpoint       | What it does                                         |
| ------ | -------------- | ---------------------------------------------------- |
| `GET`  | `/problem`     | List all problems (only `id`, `title`, `difficulty`) |
| `GET`  | `/problem/:id` | Get one problem by slug (excludes `test_cases`)      |

Example: `GET /problem/two-sum` returns full problem details **without** hidden test cases.

### 4. Submission API (`/submission`)

| Method | Endpoint      | Body                              |
| ------ | ------------- | --------------------------------- |
| `POST` | `/submission` | `{ problemId, code, languageId }` |

Flow in `submissionController.js`:

1. Validates `problemId` and `code`
2. Looks up the problem in MongoDB
3. Sends raw `code` to Judge0 at `JUDGE0_URL/submissions?wait=true`
4. Returns Judge0’s response (stdout, stderr, status, time, memory)

**Important limitation:** The submission endpoint currently **does not run your problem’s test cases**. It only executes the raw code you send. The `test_cases` in the DB are stored but not used for judging yet.

Default `languageId` is `71` (Python 3) if not provided.

### 5. Database seeding (`models/upload.js`)

This is a one-time seed script that upserts two sample problems:

- **Two Sum**
- **Valid Parentheses**

Run it when the database is empty or you want to refresh sample data.

***

## Environment Variables (`.env`)

```env
PORT=5000
MONGODB_URI=<your-mongodb-connection-string>
JUDGE0_URL=<judge0-server-url>
```

Your project already has these set. The MongoDB URI points to a cloud Atlas cluster with a `placement` database.

**Security note:** Your `.env` contains real credentials. Do not commit it to git (only `node_modules` is in `.gitignore` right now — consider adding `.env`). Rotate credentials if this repo is shared publicly.

***

## How to Run on Your System

I verified this on your machine: Node `v22.18.0`, npm `10.9.3`, and the server starts successfully.

### Prerequisites

- **Node.js** 18+ (you have 22)
- **npm**
- Network access to MongoDB Atlas and the Judge0 server

### Step 1: Install dependencies

```bash
cd /home/biraj/Projects/Backend
npm install
```

### Step 2: Configure `.env`

Ensure `.env` has valid values for `MONGODB_URI` and `JUDGE0_URL`. If you use your own MongoDB, update `MONGODB_URI`.

### Step 3: Seed the database (first time only)

```bash
node models/upload.js
```

You should see:

```
Connected to MongoDB
Upserted problem: two-sum
Upserted problem: valid-parentheses
Seeding complete
```

### Step 4: Start the server

There is no `start` script in `package.json` yet, so run:

```bash
node app.js
```

Expected output:

```
MongoDB connected
Server running on port 5000
```

Optional: add a start script to `package.json`:

```json
"scripts": {
  "start": "node app.js",
  "dev": "nodemon app.js",
  "seed": "node models/upload.js"
}
```

Then you can use `npm start` or `npm run dev`.

***

## How to Test

There are **no automated tests** (`npm test` only prints an error). Test manually with `curl`, Postman, or similar.

### 1. Health check — list problems

```bash
curl http://localhost:5000/problem
```

Expected: JSON with 2 problems (`two-sum`, `valid-parentheses`).

### 2. Get a single problem

```bash
curl http://localhost:5000/problem/two-sum
```

Expected: full problem details (no `test_cases`).

### 3. Submit code to Judge0

```bash
curl -X POST http://localhost:5000/submission \
  -H "Content-Type: application/json" \
  -d '{
    "problemId": "two-sum",
    "code": "print(1+1)",
    "languageId": 71
  }'
```

Expected: Judge0 response with `"status": { "description": "Accepted" }` and stdout.

### 4. Error cases

```bash
# Missing problemId
curl -X POST http://localhost:5000/submission \
  -H "Content-Type: application/json" \
  -d '{"code": "print(1)"}'

# Unknown problem
curl http://localhost:5000/problem/nonexistent

# Unknown route
curl http://localhost:5000/api/problems
```

### 5. Verify Judge0 connectivity

If submission fails with a network error, check that `JUDGE0_URL` in `.env` is reachable:

```bash
curl http://13.201.101.136:2358/languages
```

***

## API Quick Reference

| Endpoint       | Method | Description         |
| -------------- | ------ | ------------------- |
| `/problem`     | GET    | List all problems   |
| `/problem/:id` | GET    | Get problem by slug |
| `/submission`  | POST   | Run code via Judge0 |

**Submission body:**

```json
{
  "problemId": "two-sum",
  "code": "your source code here",
  "languageId": 71
}
```

Common Judge0 language IDs: `71` = Python 3, `63` = JavaScript (Node), `62` = Java.

***

## What’s Incomplete / Worth Knowing

1. **No real judging yet** — submissions don’t wrap user code with test cases from the DB.
2. **No auth** — anyone can call the APIs.
3. **No submission history** — results aren’t saved to MongoDB.
4. **No README or test suite** in the repo.
5. **Route comments mismatch** — comments say `/api/problems` but actual paths are `/problem` and `/submission`.

***

## Typical Development Workflow

```bash
# Terminal 1 — run server with auto-reload
npx nodemon app.js

# Terminal 2 — test APIs
curl http://localhost:5000/problem
```

If you want, I can next help you add `npm start` / `npm run dev` scripts, a proper README, or implement real test-case judging against the stored `test_cases`.

***

**User**

\<system\_notification>
The following task has finished. If you were already aware, ignore this notification and do not restate prior responses.

<task>
kind: shell
status: aborted
task_id: 834889
title: Start Express server to verify it runs
tool_call_id: tool_2fbff51f-a1bd-4902-b8b6-5b6653054fb
output_path: /home/biraj/.cursor/projects/home-biraj-Projects-Backend/terminals/834889.txt
</task>
</system_notification>
<user_query>Briefly inform the user about the task result and perform any follow-up actions (if needed). If there's no follow-ups needed, don't explicitly say that.</user_query>

***

**Cursor**

The server verification completed successfully before that background process was stopped.

**What was confirmed on your machine:**

- `npm install` works
- `node app.js` starts cleanly (`MongoDB connected`, `Server running on port 5000`)
- `GET /problem` returns both seeded problems
- `GET /problem/two-sum` returns full problem details
- `POST /submission` reaches Judge0 and returns an Accepted response

To run it yourself:

```bash
cd /home/biraj/Projects/Backend
npm install          # if not done already
node models/upload.js   # first time only, to seed problems
node app.js
```

Then test with `curl http://localhost:5000/problem`.
