// The "control plane": a handful of tables that live permanently in the `public` Postgres schema
// and are never themselves tenant-scoped — they're what let a request figure out WHICH tenant
// schema to use in the first place, before any tenant-scoped Prisma call can be made. Deliberately
// implemented with the plain `pg` driver rather than Prisma: Prisma's client is bound to one schema
// per instance, which is exactly the problem this module exists to solve, so using it here would be
// circular. All queries explicitly qualify `public.<table>` so they're unaffected by whatever
// search_path a connection happens to have.
import { Pool } from "pg";
import { env } from "./env";
import { evictSchemaClient, runWithTenant } from "./prisma";

export const controlPlanePool = new Pool({ connectionString: env.DATABASE_URL });

export interface OrganizationRow {
  id: number;
  name: string;
  schemaName: string;
  createdAt: Date;
  logoUrl: string | null;
}

let bootstrapped = false;

// Idempotent — safe to call on every server boot (same convention as backfillHarnessPermission).
export async function bootstrapControlPlane(): Promise<void> {
  if (bootstrapped) return;
  await controlPlanePool.query(`
    CREATE TABLE IF NOT EXISTS public.organizations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      schema_name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Added after the table's original creation — IF NOT EXISTS makes this safe to re-run against
  // an already-bootstrapped database (same convention as the rest of this function).
  await controlPlanePool.query(`ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;`);
  await controlPlanePool.query(`
    CREATE TABLE IF NOT EXISTS public.account_index (
      email TEXT PRIMARY KEY,
      schema_name TEXT NOT NULL,
      organization_id INTEGER NOT NULL REFERENCES public.organizations(id)
    );
  `);
  // Generic index for any hash/opaque-token-based lookup that must resolve a tenant before the
  // real (tenant-scoped) table can be queried: refresh-session tokens, password-reset tokens,
  // magic-login tokens, and raw device/relay/MCP API keys. `kind` is metadata only (not used to
  // disambiguate lookups) since every value indexed here is already a cryptographically random
  // token/hash, so cross-kind collisions are not a real possibility.
  await controlPlanePool.query(`
    CREATE TABLE IF NOT EXISTS public.token_index (
      token TEXT PRIMARY KEY,
      schema_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // System-Admin-only escalation for the external API gateway (see apiConnectionAuth.ts) — a token
  // with this flag set still defaults to `schema_name` (its home/creating organization) unless the
  // caller explicitly overrides it per-request via the X-Organization-Id header. Only "external-api"
  // kind tokens ever set this true; every other kind (refresh/reset/magic/agent/mcp/invite) is
  // created via registerToken's default of false and is unaffected.
  await controlPlanePool.query(`ALTER TABLE public.token_index ADD COLUMN IF NOT EXISTS all_organizations BOOLEAN NOT NULL DEFAULT false;`);

  // Register the pre-existing `public` schema itself as Organization #1 — the app ran
  // single-tenant in `public` before multi-tenancy existed, so its data becomes the first
  // organization in place rather than being physically migrated anywhere.
  const existingDefault = await controlPlanePool.query<{ id: number }>(
    `SELECT id FROM public.organizations WHERE schema_name = 'public'`
  );
  let defaultOrgId: number;
  if (existingDefault.rows.length === 0) {
    let companyName = "Default Organization";
    try {
      const setting = await controlPlanePool.query<{ value: string }>(
        `SELECT value FROM public."SystemSetting" WHERE key = 'companyName'`
      );
      if (setting.rows[0]?.value) companyName = setting.rows[0].value;
    } catch {
      // SystemSetting may not exist yet on a brand-new database — fine, keep the fallback name.
    }
    const inserted = await controlPlanePool.query<{ id: number }>(
      `INSERT INTO public.organizations (name, schema_name) VALUES ($1, 'public') RETURNING id`,
      [companyName]
    );
    defaultOrgId = inserted.rows[0].id;
  } else {
    defaultOrgId = existingDefault.rows[0].id;
  }

  // Backfill account_index from any users that already exist in `public` (the pre-multi-tenancy
  // installation) so they can still log in — ON CONFLICT DO NOTHING makes this safe to re-run.
  try {
    await controlPlanePool.query(
      `INSERT INTO public.account_index (email, schema_name, organization_id)
       SELECT email, 'public', $1 FROM public."User"
       ON CONFLICT (email) DO NOTHING`,
      [defaultOrgId]
    );
  } catch {
    // Same as above — a brand-new database has no User table yet.
  }

  // Same idea for standing infrastructure credentials that pre-date multi-tenancy: the device
  // agent, the network relay (same key type), and any MCP API keys already issued. Unlike a
  // refresh/reset/magic-login token, these are long-lived and not tied to a browser session — if
  // left unindexed, the existing device agent + relay + any Claude/MCP integration on a
  // pre-existing install would start failing auth the moment this ships.
  try {
    await controlPlanePool.query(
      `INSERT INTO public.token_index (token, schema_name, kind)
       SELECT key, 'public', 'agent' FROM public."AgentApiKey"
       ON CONFLICT (token) DO NOTHING`
    );
  } catch {
    // Brand-new database — table doesn't exist yet.
  }
  try {
    await controlPlanePool.query(
      `INSERT INTO public.token_index (token, schema_name, kind)
       SELECT key, 'public', 'mcp' FROM public."McpApiKey"
       ON CONFLICT (token) DO NOTHING`
    );
  } catch {
    // Brand-new database — table doesn't exist yet.
  }

  bootstrapped = true;
}

export async function listOrganizations(): Promise<OrganizationRow[]> {
  const result = await controlPlanePool.query<{ id: number; name: string; schema_name: string; created_at: Date; logo_url: string | null }>(
    `SELECT id, name, schema_name, created_at, logo_url FROM public.organizations ORDER BY id ASC`
  );
  return result.rows.map((r) => ({ id: r.id, name: r.name, schemaName: r.schema_name, createdAt: r.created_at, logoUrl: r.logo_url }));
}

export async function getOrganizationById(id: number): Promise<OrganizationRow | null> {
  const result = await controlPlanePool.query<{ id: number; name: string; schema_name: string; created_at: Date; logo_url: string | null }>(
    `SELECT id, name, schema_name, created_at, logo_url FROM public.organizations WHERE id = $1`,
    [id]
  );
  const r = result.rows[0];
  return r ? { id: r.id, name: r.name, schemaName: r.schema_name, createdAt: r.created_at, logoUrl: r.logo_url } : null;
}

export async function updateOrganizationName(id: number, name: string): Promise<void> {
  await controlPlanePool.query(`UPDATE public.organizations SET name = $2 WHERE id = $1`, [id, name]);
}

export async function updateOrganizationLogo(id: number, logoUrl: string): Promise<void> {
  await controlPlanePool.query(`UPDATE public.organizations SET logo_url = $2 WHERE id = $1`, [id, logoUrl]);
}

// Physically renames the Postgres schema itself — not just the control plane's own label for it.
// Every table this schema owns keeps its data untouched; only the schema's name changes. The
// `public` schema (the original pre-multi-tenancy installation) is deliberately never renameable
// via this path — too much else in Postgres and this app assumes "public" exists verbatim.
export async function renameOrganizationSchema(id: number, newSchemaName: string): Promise<void> {
  // Interpolated directly into raw SQL below (Postgres identifiers can't be parameterized) — this
  // is the only thing standing between a schema name and a SQL-injection vector, so it's enforced
  // here too, not just at whatever Zod schema happens to gate the calling route.
  if (!/^[a-z][a-z0-9_]{2,50}$/.test(newSchemaName)) {
    throw new Error("Schema name must be lowercase letters, numbers, and underscores, starting with a letter.");
  }

  const org = await getOrganizationById(id);
  if (!org) throw new Error("Organization not found");
  if (org.schemaName === "public") throw new Error("The default organization's schema cannot be renamed.");
  if (org.schemaName === newSchemaName) return;

  const existing = await controlPlanePool.query(`SELECT 1 FROM public.organizations WHERE schema_name = $1`, [newSchemaName]);
  if (existing.rows.length > 0) throw new Error("That schema name is already in use.");

  const client = await controlPlanePool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`ALTER SCHEMA "${org.schemaName}" RENAME TO "${newSchemaName}"`);
    await client.query(`UPDATE public.organizations SET schema_name = $2 WHERE id = $1`, [id, newSchemaName]);
    await client.query(`UPDATE public.account_index SET schema_name = $2 WHERE schema_name = $1`, [org.schemaName, newSchemaName]);
    await client.query(`UPDATE public.token_index SET schema_name = $2 WHERE schema_name = $1`, [org.schemaName, newSchemaName]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // The cached PrismaClient for the old name has a connection string baked in with
  // `?schema=<old name>` — it's now pointing at a schema that no longer exists under that name.
  await evictSchemaClient(org.schemaName);
}

export async function createOrganization(name: string, schemaName: string): Promise<OrganizationRow> {
  const result = await controlPlanePool.query<{ id: number; name: string; schema_name: string; created_at: Date; logo_url: string | null }>(
    `INSERT INTO public.organizations (name, schema_name) VALUES ($1, $2) RETURNING id, name, schema_name, created_at, logo_url`,
    [name, schemaName]
  );
  const r = result.rows[0];
  return { id: r.id, name: r.name, schemaName: r.schema_name, createdAt: r.created_at, logoUrl: r.logo_url };
}

export async function resolveAccountSchema(email: string): Promise<string | null> {
  const result = await controlPlanePool.query<{ schema_name: string }>(
    `SELECT schema_name FROM public.account_index WHERE email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0]?.schema_name ?? null;
}

export async function registerAccount(email: string, schemaName: string, organizationId: number): Promise<void> {
  await controlPlanePool.query(
    `INSERT INTO public.account_index (email, schema_name, organization_id) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET schema_name = EXCLUDED.schema_name, organization_id = EXCLUDED.organization_id`,
    [email.toLowerCase(), schemaName, organizationId]
  );
}

export async function registerToken(token: string, schemaName: string, kind: string, allOrganizations = false): Promise<void> {
  await controlPlanePool.query(
    `INSERT INTO public.token_index (token, schema_name, kind, all_organizations) VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO UPDATE SET schema_name = EXCLUDED.schema_name, kind = EXCLUDED.kind, all_organizations = EXCLUDED.all_organizations`,
    [token, schemaName, kind, allOrganizations]
  );
}

export async function resolveTokenSchema(token: string): Promise<string | null> {
  const result = await controlPlanePool.query<{ schema_name: string }>(
    `SELECT schema_name FROM public.token_index WHERE token = $1`,
    [token]
  );
  return result.rows[0]?.schema_name ?? null;
}

// Used only by the external API gateway (verifyApiConnection) — every other token consumer just
// needs the fixed home schema from resolveTokenSchema above.
export async function resolveTokenScope(token: string): Promise<{ schemaName: string; allOrganizations: boolean } | null> {
  const result = await controlPlanePool.query<{ schema_name: string; all_organizations: boolean }>(
    `SELECT schema_name, all_organizations FROM public.token_index WHERE token = $1`,
    [token]
  );
  const r = result.rows[0];
  return r ? { schemaName: r.schema_name, allOrganizations: r.all_organizations } : null;
}

// Runs `fn` once per organization, each under its own tenant context, for background schedulers
// that must act on every tenant's data (not just the default org). One organization's failure is
// logged and skipped rather than aborting the rest — a bug or outage in one tenant's data
// shouldn't stop backups/alerts/monitoring from running for everyone else.
export async function runForEachOrganization<T>(fn: () => Promise<T>): Promise<void> {
  const orgs = await listOrganizations();
  for (const org of orgs) {
    try {
      await runWithTenant(org.schemaName, fn);
    } catch (err) {
      console.error(`[runForEachOrganization] organization ${org.id} (${org.schemaName}) failed:`, err);
    }
  }
}
