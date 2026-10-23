import crypto from "crypto";
import Contest from "../models/contest.js";
import {
  getRuntimeStatus,
  isContestDraftEditable,
  validateContestTimes,
  validateSections,
} from "../utility/contestStatus.js";
import { freezeContestSections } from "../services/contestSnapshotService.js";
import {
  generateJoinCode,
  hashJoinCode,
} from "../services/joinCodeService.js";

export function normalizeSections(sections) {
  return (sections ?? []).map((section) => ({
    sectionKey: section.sectionKey ?? crypto.randomUUID(),
    type: section.type,
    name: String(section.name ?? "").trim(),
    marksPerQuestion: Number(section.marksPerQuestion),
    questions: (section.questions ?? []).map((question) => ({
      questionKey: question.questionKey ?? crypto.randomUUID(),
      source: question.source,
      libraryRef: question.libraryRef,
      snapshot: question.snapshot,
    })),
  }));
}

export function validateDraftQuestions(sections) {
  for (const section of sections) {
    for (const question of section.questions) {
      if (!["library", "custom"].includes(question.source)) {
        return "Each question must have source library or custom";
      }
      if (question.source === "library") {
        if (!question.libraryRef?.model || !question.libraryRef?.id) {
          return "Library questions require libraryRef";
        }
      }
      if (question.source === "custom" && !question.snapshot) {
        return "Custom questions require a snapshot while in draft";
      }
    }
  }
  return null;
}

export function parseVisibility(value) {
  const normalized = String(value ?? "public").toLowerCase();
  if (normalized === "private" || normalized === "public") {
    return normalized;
  }
  return null;
}

export async function createContestDraft({
  body,
  createdBy = null,
}) {
  const title = String(body?.title ?? "").trim();
  if (!title) {
    throw new Error("title is required");
  }

  const visibility = parseVisibility(body?.visibility);
  if (!visibility) {
    throw new Error("visibility must be public or private");
  }

  const timeError = validateContestTimes(body?.startTime, body?.endTime);
  if (timeError) {
    throw new Error(timeError);
  }

  const sections = normalizeSections(body?.sections);
  const sectionError = validateSections(sections);
  if (sectionError) {
    throw new Error(sectionError);
  }

  const draftQuestionError = validateDraftQuestions(sections);
  if (draftQuestionError) {
    throw new Error(draftQuestionError);
  }

  const contest = await Contest.create({
    title,
    description: String(body?.description ?? ""),
    rules: String(body?.rules ?? ""),
    startTime: body.startTime,
    endTime: body.endTime,
    maxParticipants: body?.maxParticipants,
    visibility,
    createdBy,
    joinCodeHash: undefined,
    published: false,
    sections,
  });

  return contest;
}

export async function updateContestDraft({ contest, body }) {
  if (!isContestDraftEditable(contest)) {
    throw new Error("Only draft contests can be edited");
  }

  const title =
    body?.title != null ? String(body.title).trim() : contest.title;
  if (!title) {
    throw new Error("title is required");
  }

  const visibility =
    body?.visibility != null
      ? parseVisibility(body.visibility)
      : contest.visibility ?? "public";
  if (!visibility) {
    throw new Error("visibility must be public or private");
  }

  const startTime = body?.startTime ?? contest.startTime;
  const endTime = body?.endTime ?? contest.endTime;
  const timeError = validateContestTimes(startTime, endTime);
  if (timeError) {
    throw new Error(timeError);
  }

  const sections = body?.sections
    ? normalizeSections(body.sections)
    : contest.sections;

  const sectionError = validateSections(sections);
  if (sectionError) {
    throw new Error(sectionError);
  }

  const draftQuestionError = validateDraftQuestions(sections);
  if (draftQuestionError) {
    throw new Error(draftQuestionError);
  }

  contest.title = title;
  contest.description =
    body?.description != null
      ? String(body.description)
      : contest.description;
  contest.rules =
    body?.rules != null ? String(body.rules) : contest.rules;
  contest.startTime = startTime;
  contest.endTime = endTime;
  contest.maxParticipants =
    body?.maxParticipants !== undefined
      ? body.maxParticipants
      : contest.maxParticipants;
  contest.visibility = visibility;
  contest.sections = sections;
  if (visibility === "public") {
    contest.joinCodeHash = undefined;
  }

  await contest.save();
  return contest;
}

export async function publishContestDraft(contest) {
  if (!isContestDraftEditable(contest)) {
    throw new Error("Contest is already published");
  }

  const timeError = validateContestTimes(contest.startTime, contest.endTime);
  if (timeError) {
    throw new Error(timeError);
  }

  const sectionError = validateSections(contest.sections);
  if (sectionError) {
    throw new Error(sectionError);
  }

  const frozenSections = await freezeContestSections(contest.sections);
  contest.sections = frozenSections;
  contest.published = true;
  contest.publishedAt = new Date();

  let joinCodePlain = null;
  const visibility = contest.visibility ?? "public";
  if (visibility === "private") {
    joinCodePlain = generateJoinCode();
    contest.joinCodeHash = await hashJoinCode(joinCodePlain);
  } else {
    contest.joinCodeHash = undefined;
  }

  await contest.save();

  return { contest, joinCodePlain, status: getRuntimeStatus(contest) };
}

export async function regeneratePrivateJoinCode(contest) {
  if (!contest.published) {
    throw new Error("Publish the contest before regenerating a join code");
  }
  if ((contest.visibility ?? "public") !== "private") {
    throw new Error("Join codes apply only to private contests");
  }

  const joinCodePlain = generateJoinCode();
  contest.joinCodeHash = await hashJoinCode(joinCodePlain);
  await contest.save();

  return { contest, joinCodePlain };
}

export function assertContestOwner(contest, userId) {
  if (!contest?.createdBy) {
    return false;
  }
  return contest.createdBy.toString() === userId;
}
