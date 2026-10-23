import crypto from "crypto";
import bcrypt from "bcryptjs";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BCRYPT_ROUNDS = 10;

export function normalizeJoinCodeInput(input) {
  return String(input ?? "")
    .replace(/[\s-]+/g, "")
    .toUpperCase();
}

export function generateJoinCode() {
  const bytes = crypto.randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i++) {
    raw += CHARSET[bytes[i] % CHARSET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export async function hashJoinCode(plain) {
  const normalized = normalizeJoinCodeInput(plain);
  if (!normalized) {
    throw new Error("Join code is empty");
  }
  return bcrypt.hash(normalized, BCRYPT_ROUNDS);
}

export async function verifyJoinCode(plain, hash) {
  if (!hash || !plain) return false;
  const normalized = normalizeJoinCodeInput(plain);
  if (!normalized) return false;
  return bcrypt.compare(normalized, hash);
}
