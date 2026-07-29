import crypto from "crypto";

const WORDS = ["kynren", "asset", "orbit", "harbor", "cedar", "delta", "quartz", "meadow", "granite", "falcon"];

export function generateTempPassword(): string {
  const word = WORDS[crypto.randomInt(0, WORDS.length)];
  const digits = crypto.randomInt(1000, 9999);
  const symbol = "!@#$%".charAt(crypto.randomInt(0, 5));
  return `${word[0].toUpperCase()}${word.slice(1)}${symbol}${digits}`;
}

export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
