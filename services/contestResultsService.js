export function submissionHasAnswer(sectionType, row) {
  if (sectionType === "DSA") {
    return Boolean(row?.dsaAnswerSubmittedAt);
  }
  return row?.selectedIndex != null;
}

/**
 * Build per-question rows in contest paper order (sections → questions).
 */
export function buildOrderedResultRows(contest, submissions, { includeScores }) {
  const byKey = new Map(
    (submissions ?? []).map((row) => [row.questionKey, row]),
  );
  const rows = [];
  let overallNumber = 0;

  for (const section of contest.sections ?? []) {
    let sectionNumber = 0;
    for (const question of section.questions ?? []) {
      sectionNumber += 1;
      overallNumber += 1;
      const stored = byKey.get(question.questionKey);
      const sectionType = section.type;
      const answered = submissionHasAnswer(sectionType, stored);
      const maxMarks = section.marksPerQuestion ?? 0;

      const base = {
        questionKey: question.questionKey,
        sectionKey: section.sectionKey,
        sectionName: section.name,
        sectionType,
        questionNumberInSection: sectionNumber,
        questionNumberOverall: overallNumber,
        maxMarks,
        answered,
        dsaAnswerSubmittedAt: stored?.dsaAnswerSubmittedAt ?? null,
        lastSavedAt: stored?.lastSavedAt ?? null,
      };

      if (!includeScores) {
        rows.push({
          ...base,
          selectedIndex: stored?.selectedIndex,
          code: stored?.code,
          languageId: stored?.languageId,
          hasAnswer: answered,
        });
        continue;
      }

      let marksAwarded = 0;
      let isCorrect = false;
      let status = "unanswered";

      if (sectionType === "DSA") {
        if (!answered) {
          status = stored?.code?.trim() ? "not_submitted" : "unanswered";
        } else if (stored?.graded) {
          isCorrect = Boolean(stored.isCorrect);
          marksAwarded = stored.marksAwarded ?? 0;
          status = isCorrect ? "correct" : "incorrect";
        } else {
          status = "pending";
        }
      } else if (answered && stored?.graded) {
        isCorrect = Boolean(stored.isCorrect);
        marksAwarded = stored.marksAwarded ?? 0;
        status = isCorrect ? "correct" : "incorrect";
      } else if (answered) {
        status = "pending";
      }

      rows.push({
        ...base,
        graded: stored?.graded ?? false,
        isCorrect,
        marksAwarded,
        status,
        hasAnswer: answered,
      });
    }
  }

  return rows;
}
