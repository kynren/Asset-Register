import crypto from "crypto";

// `apiKeyId` is the public half of an ApiConnection credential — safe to display/log, used only
// to look up the row and resolve its tenant schema via the control-plane token index. `secret` is
// the private half; only its SHA-256 hash is ever persisted (see hashSecret), so a database leak
// alone can never recover a usable credential. Both halves carry 256 bits of entropy — far beyond
// what SHA-256 (rather than a slow KDF like bcrypt/scrypt) needs to stay safe against brute force,
// which is why a plain fast hash is the *correct* choice here, not a shortcut: bcrypt/scrypt exist
// to slow down guessing a low-entropy human password, and would only add needless CPU cost against
// a secret an attacker can't feasibly guess in the first place.
export function generateApiKeyId(): string {
  return `ak_${crypto.randomBytes(16).toString("hex")}`;
}

export function generateApiSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}

// Constant-time comparison so verifying a wrong secret takes the same time regardless of how many
// leading hex characters happen to match — an ordinary `===` leaks that information via response
// timing, which is exactly what lets an attacker brute-force a secret one byte at a time.
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
