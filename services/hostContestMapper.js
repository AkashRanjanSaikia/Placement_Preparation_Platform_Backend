import Problem from "../models/problem.js";
import Question from "../models/question.js";

async function labelForLibraryQuestion(libraryRef) {
  if (!libraryRef?.model || !libraryRef?.id) {
    return "Library question";
  }
  if (libraryRef.model === "Problem") {
    const problem = await Problem.findById(libraryRef.id).select("title slug");
    return problem?.title ?? "DSA problem";
  }
  const question = await Question.findById(libraryRef.id).select("questionText");
  const text = question?.questionText ?? "MCQ question";
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

export async function buildEditableSections(contestSections) {
  const sections = [];

  for (const section of contestSections ?? []) {
    const libraryItems = [];
    const customMcqs = [];

    for (const question of section.questions ?? []) {
      if (question.source === "library") {
        libraryItems.push({
          id: String(question.libraryRef?.id ?? ""),
          model: question.libraryRef?.model,
          label: await labelForLibraryQuestion(question.libraryRef),
        });
      } else if (question.source === "custom" && question.snapshot) {
        customMcqs.push({
          id: question.questionKey,
          questionText: question.snapshot.questionText,
          options: question.snapshot.options ?? [],
          correctIndex: question.snapshot.correctAnswers?.[0] ?? 0,
          difficulty: question.snapshot.difficulty ?? "medium",
        });
      }
    }

    sections.push({
      sectionKey: section.sectionKey,
      type: section.type,
      name: section.name,
      marksPerQuestion: section.marksPerQuestion,
      libraryItems,
      customMcqs,
    });
  }

  return sections;
}

export function countQuestionsInSections(sections) {
  return (sections ?? []).reduce(
    (sum, section) => sum + (section.questions?.length ?? 0),
    0,
  );
}
