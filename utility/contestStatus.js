export const RUNTIME_STATUSES = ["upcoming", "live", "completed"];

export function getRuntimeStatus(contest, now = new Date()) {
  if (!contest?.published) {
    return "draft";
  }

  const start = new Date(contest.startTime);
  const end = new Date(contest.endTime);

  if (now < start) return "upcoming";
  if (now <= end) return "live";
  return "completed";
}

export function isContestDraftEditable(contest) {
  return contest && !contest.published;
}

export function validateContestTimes(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "startTime and endTime must be valid dates";
  }

  if (end <= start) {
    return "endTime must be after startTime";
  }

  return null;
}

export function validateSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return "At least one section is required";
  }

  for (const section of sections) {
    if (!section?.name || !section?.type) {
      return "Each section must have a name and type";
    }
    if (!Array.isArray(section.questions) || section.questions.length === 0) {
      return `Section "${section.name}" must include at least one question`;
    }
    const marks = section.marksPerQuestion;
    if (marks == null || Number(marks) < 0) {
      return `Section "${section.name}" must have marksPerQuestion >= 0`;
    }
  }

  return null;
}

export function serverTimePayload(now = new Date()) {
  return { serverTime: now.toISOString() };
}
