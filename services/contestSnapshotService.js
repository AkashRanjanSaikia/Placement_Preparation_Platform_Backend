import Problem from "../models/problem.js";
import Question from "../models/question.js";
import Template from "../models/template.js";

function problemToSnapshot(problem, harnessTemplates) {
  const doc = problem.toObject();
  return {
    kind: "DSA",
    contestOnly: false,
    slug: doc.slug,
    title: doc.title,
    difficulty: doc.difficulty,
    description: doc.description,
    constraints: doc.constraints ?? [],
    examples: doc.examples ?? [],
    example_test_cases: doc.example_test_cases ?? [],
    starter_code: doc.starter_code ?? [],
    test_cases: doc.test_cases ?? [],
    harnessTemplates: harnessTemplates.map((t) => ({
      language: t.language,
      harness_template: t.harness_template,
    })),
  };
}

function questionToSnapshot(question, sectionType) {
  const doc = question.toObject();
  return {
    kind: "MCQ",
    contestOnly: false,
    sectionType,
    category: doc.category,
    subject: doc.subject,
    topic: doc.topic,
    difficulty: doc.difficulty,
    questionText: doc.questionText,
    questionType: doc.questionType,
    options: doc.options ?? [],
    correctAnswers: doc.correctAnswers ?? [],
    explanation: doc.explanation,
  };
}

function validateCustomSnapshot(snapshot, sectionType) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Custom question requires a snapshot object");
  }

  if (sectionType === "DSA") {
    if (!snapshot.title || !snapshot.description) {
      throw new Error("DSA custom snapshot requires title and description");
    }
    if (!Array.isArray(snapshot.test_cases) || snapshot.test_cases.length === 0) {
      throw new Error("DSA custom snapshot requires at least one test case");
    }
    if (
      !Array.isArray(snapshot.harnessTemplates) ||
      snapshot.harnessTemplates.length === 0
    ) {
      throw new Error(
        "DSA custom snapshot requires harnessTemplates for grading",
      );
    }
    return {
      ...snapshot,
      kind: "DSA",
      contestOnly: true,
    };
  }

  if (!snapshot.questionText || !Array.isArray(snapshot.options)) {
    throw new Error("MCQ custom snapshot requires questionText and options");
  }
  if (!Array.isArray(snapshot.correctAnswers)) {
    throw new Error("MCQ custom snapshot requires correctAnswers");
  }

  return {
    ...snapshot,
    kind: "MCQ",
    contestOnly: true,
    sectionType,
  };
}

async function resolveLibrarySnapshot(sectionType, libraryRef) {
  if (!libraryRef?.model || !libraryRef?.id) {
    throw new Error("Library question requires libraryRef.model and libraryRef.id");
  }

  if (libraryRef.model === "Problem") {
    if (sectionType !== "DSA") {
      throw new Error("Problem library entries must be in a DSA section");
    }

    const problem = await Problem.findById(libraryRef.id);
    if (!problem) {
      throw new Error("Referenced DSA problem was not found");
    }

    const templates = await Template.find({ problem_id: problem.slug });
    if (!templates.length) {
      throw new Error(
        `No Judge0 harness templates found for problem "${problem.slug}"`,
      );
    }

    return problemToSnapshot(problem, templates);
  }

  if (libraryRef.model === "Question") {
    const question = await Question.findById(libraryRef.id);
    if (!question) {
      throw new Error("Referenced question was not found");
    }

    const expectedCategory =
      sectionType === "APTITUDE" ? "aptitude" : "core_cs";
    if (question.category !== expectedCategory) {
      throw new Error(
        `Question category "${question.category}" does not match section type ${sectionType}`,
      );
    }

    return questionToSnapshot(question, sectionType);
  }

  throw new Error(`Unsupported library model "${libraryRef.model}"`);
}

export async function freezeContestSections(sections) {
  const frozenSections = [];

  for (const section of sections) {
    const frozenQuestions = [];

    for (const question of section.questions ?? []) {
      let snapshot = question.snapshot;

      if (question.source === "library") {
        snapshot = await resolveLibrarySnapshot(section.type, question.libraryRef);
      } else if (question.source === "custom") {
        snapshot = validateCustomSnapshot(snapshot, section.type);
      } else {
        throw new Error(`Invalid question source "${question.source}"`);
      }

      frozenQuestions.push({
        questionKey: question.questionKey,
        source: question.source,
        libraryRef: question.libraryRef,
        snapshot,
      });
    }

    frozenSections.push({
      sectionKey: section.sectionKey,
      type: section.type,
      name: section.name,
      marksPerQuestion: section.marksPerQuestion,
      questions: frozenQuestions,
    });
  }

  return frozenSections;
}

export function findContestQuestion(contest, questionKey) {
  for (const section of contest.sections ?? []) {
    const question = section.questions?.find((q) => q.questionKey === questionKey);
    if (question) {
      return { section, question };
    }
  }
  return null;
}

export function sanitizeSnapshotForAttempt(snapshot) {
  if (!snapshot) return null;

  if (snapshot.kind === "DSA") {
    return {
      kind: snapshot.kind,
      slug: snapshot.slug,
      title: snapshot.title,
      difficulty: snapshot.difficulty,
      description: snapshot.description,
      constraints: snapshot.constraints ?? [],
      examples: snapshot.examples ?? [],
      example_test_cases: snapshot.example_test_cases ?? [],
      starter_code: snapshot.starter_code ?? [],
    };
  }

  return {
    kind: snapshot.kind,
    sectionType: snapshot.sectionType,
    difficulty: snapshot.difficulty,
    questionText: snapshot.questionText,
    questionType: snapshot.questionType,
    options: snapshot.options ?? [],
  };
}
