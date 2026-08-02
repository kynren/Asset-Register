// Multi-tenant Prisma access. Each organization's data lives in its own Postgres schema (see
// controlPlane.ts + tenantProvisioning.ts) — this module is what lets the ~40 existing modules
// that already `import { prisma } from "../../config/prisma"` keep working completely unchanged.
//
// How: an AsyncLocalStorage store carries the "current tenant's schema name" through the async
// call graph of a single request (or a single scheduler tick — see runWithTenant). `prisma` is
// exported not as one real PrismaClient but as a Proxy: every property access resolves, at that
// exact moment, to the real PrismaClient for whichever schema is current, cached per schema so a
// given tenant only ever gets one open connection pool. Code that calls `prisma.asset.findMany()`
// has no idea any of this is happening — it just works, scoped to the right tenant automatically.
//
// Code that runs with no request in flight (server boot, a scheduler tick that hasn't been
// wrapped in runWithTenant yet) falls back to the `public` schema — the original, pre-multi-tenant
// installation's data — so nothing that existed before this file changed behavior by default.
import { AsyncLocalStorage } from "async_hooks";
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

export const DEFAULT_SCHEMA = "public";

interface TenantStore {
  schemaName: string;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();
const clientCache = new Map<string, PrismaClient>();

export function tenantDatabaseUrl(schemaName: string): string {
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

function getClientForSchema(schemaName: string): PrismaClient {
  let client = clientCache.get(schemaName);
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: tenantDatabaseUrl(schemaName) } } });
    clientCache.set(schemaName, client);
  }
  return client;
}

export function currentSchemaName(): string {
  return tenantStorage.getStore()?.schemaName ?? DEFAULT_SCHEMA;
}

// Runs `fn` with `schemaName` as the active tenant for every `prisma.*` call made during its
// execution (including anything awaited/scheduled from within it). Used by the JWT middleware
// (once per request) and by each background scheduler (once per organization per tick).
export function runWithTenant<T>(schemaName: string, fn: () => T): T {
  return tenantStorage.run({ schemaName }, fn);
}

function resolveClient(): PrismaClient {
  return getClientForSchema(currentSchemaName());
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = resolveClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;

// Used by tenantProvisioning.ts right after `CREATE SCHEMA` + running migrations, before that
// schema has ever been the "current tenant" for a request — just forces the client into the cache.
export function primeClientForSchema(schemaName: string): PrismaClient {
  return getClientForSchema(schemaName);
}

// Used by controlPlane.ts's renameOrganizationSchema right after `ALTER SCHEMA ... RENAME TO` —
// the cached client's connection string has the OLD name baked into its `?schema=` param, so any
// further query through it would silently target a schema that no longer exists under that name.
export async function evictSchemaClient(schemaName: string): Promise<void> {
  const client = clientCache.get(schemaName);
  if (!client) return;
  clientCache.delete(schemaName);
  await client.$disconnect();
}
