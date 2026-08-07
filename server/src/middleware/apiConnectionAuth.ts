import { NextFunction, Request, Response } from "express";
import { ApiConnection } from "@prisma/client";
import { prisma, runWithTenant } from "../config/prisma";
import { resolveTokenSchema } from "../config/controlPlane";
import { hashSecret, timingSafeEqualHex } from "../lib/apiConnectionCrypto";
import { logAudit } from "../lib/auditLogger";

export interface ApiConnectionRequest extends Request {
  apiConnection?: ApiConnection;
}

const VERB_PERMISSION: Record<string, keyof Pick<ApiConnection, "canGet" | "canPost" | "canPut" | "canPatch" | "canDelete">> = {
  GET: "canGet",
  POST: "canPost",
  PUT: "canPut",
  PATCH: "canPatch",
  DELETE: "canDelete",
};

// Very small fixed-window limiter — this gateway is a per-process Node server (no separate cache
// tier), so an in-memory Map is the right amount of machinery: it resets on redeploy, which is
// fine for abuse mitigation, and needs no new infrastructure to run. 120 requests/minute per
// credential is generous for a legitimate integration polling or syncing records, while still
// bounding how hard a leaked or malfunctioning credential can hammer the database.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateLimitState = new Map<string, { windowStart: number; count: number }>();

function checkRateLimit(apiKeyId: string): boolean {
  const now = Date.now();
  const entry = rateLimitState.get(apiKeyId);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(apiKeyId, { windowStart: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

// Authenticates a call to the external REST API gateway (/api/integrations/v1/*). Credential
// format is `Authorization: Bearer <apiKeyId>.<secret>` — a single header, so any HTTP client can
// integrate without implementing custom request-signing logic. Security instead comes from:
// TLS-only transport (enforced below), a 256-bit secret that is only ever compared via its
// SHA-256 hash (never stored or logged in recoverable form), a timing-safe comparison, a
// per-credential rate limit, and per-verb + per-resource scoping enforced on every call.
export async function verifyApiConnection(req: ApiConnectionRequest, res: Response, next: NextFunction) {
  const forwardedProto = req.header("x-forwarded-proto");
  const isSecure = req.secure || forwardedProto === "https";
  if (process.env.NODE_ENV === "production" && !isSecure) {
    return res.status(400).json({ error: "HTTPS is required for the API Connections gateway." });
  }

  const auth = req.header("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const separatorIndex = bearer?.indexOf(".") ?? -1;
  if (!bearer || separatorIndex <= 0) {
    return res.status(401).json({ error: "Missing or malformed Authorization header. Use: Bearer <apiKeyId>.<secret>" });
  }
  const apiKeyId = bearer.slice(0, separatorIndex);
  const secret = bearer.slice(separatorIndex + 1);

  if (!checkRateLimit(apiKeyId)) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
  }

  const schemaName = await resolveTokenSchema(apiKeyId);
  if (!schemaName) return res.status(401).json({ error: "Invalid API credentials." });

  await runWithTenant(schemaName, async () => {
    const record = await prisma.apiConnection.findUnique({ where: { apiKeyId } });
    if (!record || !record.isActive) return res.status(401).json({ error: "Invalid or revoked API credentials." });

    if (!timingSafeEqualHex(hashSecret(secret), record.secretHash)) {
      return res.status(401).json({ error: "Invalid API credentials." });
    }

    const verbKey = VERB_PERMISSION[req.method];
    if (!verbKey || !record[verbKey]) {
      return res.status(403).json({ error: `This connection is not permitted to ${req.method}.` });
    }

    prisma.apiConnection.update({ where: { id: record.id }, data: { lastUsedAt: new Date(), lastUsedIp: req.ip } }).catch(() => undefined);
    logAudit({ action: `external-api.${req.method.toLowerCase()}`, entityType: "ApiConnection", entityId: record.id, metadata: { path: req.path } }).catch(() => undefined);

    req.apiConnection = record;
    next();
  });
}

// Called by each resource route (e.g. the assets router) after verifyApiConnection has already
// authenticated the caller — checks the connection was granted this specific resource family,
// separately from the verb check above, so a connection scoped to "assets" can't touch a future
// resource just because its verb permissions happen to allow it.
export function requireApiConnectionResource(resource: string) {
  return (req: ApiConnectionRequest, res: Response, next: NextFunction) => {
    if (!req.apiConnection?.resources.includes(resource)) {
      return res.status(403).json({ error: `This connection is not scoped to the "${resource}" resource.` });
    }
    next();
  };
}
