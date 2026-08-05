import crypto from "crypto";
import { env } from "../config/env";

const CAPTCHA_TTL_MS = 10 * 60 * 1000;

// Stateless arithmetic captcha for the public asset-intake form — no session/store needed, the
// challenge (a, b, expiry) travels with the client and is verified via HMAC signature using the
// server's own JWT secret as the key (reused only as an HMAC key here, not for token decoding).
export function generateCaptcha(): { question: string; token: string } {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const expires = Date.now() + CAPTCHA_TTL_MS;
  const payload = `${a}:${b}:${expires}`;
  const sig = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
  const token = Buffer.from(`${payload}:${sig}`).toString("base64url");
  return { question: `What is ${a} + ${b}?`, token };
}

export function verifyCaptcha(token: string, answer: number): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [a, b, expiresStr, sig] = decoded.split(":");
    const payload = `${a}:${b}:${expiresStr}`;
    const expectedSig = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
    if (sig !== expectedSig) return false;
    if (Date.now() > Number(expiresStr)) return false;
    return Number(a) + Number(b) === answer;
  } catch {
    return false;
  }
}
