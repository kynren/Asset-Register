// Provisions a brand-new tenant: its own Postgres schema, every table the app currently defines
// (via the same migration history every other schema was built from), a starter role matrix, and
// its first Super Admin user — then registers it with the control plane so login can find it.
import { execFile } from "child_process";
import crypto from "crypto";
import path from "path";
import bcrypt from "bcryptjs";
import { controlPlanePool, createOrganization, registerAccount } from "../config/controlPlane";
import { primeClientForSchema, prisma, runWithTenant, tenantDatabaseUrl } from "../config/prisma";
import { env } from "../config/env";
import { seedRoles } from "./seedRoles";

const SCHEMA_PATH = path.join(__dirname, "..", "..", "prisma", "schema.prisma");

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

async function generateUniqueSchemaName(organizationName: string): Promise<string> {
  const base = slugify(organizationName) || "org";
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = crypto.randomBytes(3).toString("hex");
    const candidate = `org_${base}_${suffix}`;
    const existing = await controlPlanePool.query(`SELECT 1 FROM public.organizations WHERE schema_name = $1`, [candidate]);
    if (existing.rows.length === 0) return candidate;
  }
  throw new Error("Could not generate a unique schema name — try again.");
}

// Invoked as `node <prisma-cli-entry> migrate deploy ...` rather than `npx prisma ...` — npx
// resolves to a `.cmd` shim on Windows, which spawn() can't exec directly (EINVAL) and which
// otherwise needs `shell: true` to run; but shell:true joins argv with plain spaces with no
// quoting, so any space in the repo path (e.g. "Asset Register") breaks `--schema=<path>`.
// Calling node directly against Prisma's own CLI entry point sidesteps both problems.
const PRISMA_CLI_ENTRY = require.resolve("prisma/build/index.js");

function runMigrateDeploy(schemaName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [PRISMA_CLI_ENTRY, "migrate", "deploy", `--schema=${SCHEMA_PATH}`],
      { env: { ...process.env, DATABASE_URL: tenantDatabaseUrl(schemaName) }, cwd: path.join(__dirname, "..", "..") },
      (error, _stdout, stderr) => {
        if (error) reject(new Error(`Failed to provision schema "${schemaName}": ${stderr || error.message}`));
        else resolve();
      }
    );
  });
}

export interface ProvisionOrganizationInput {
  organizationName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface ProvisionedOrganization {
  organizationId: number;
  schemaName: string;
  userId: number;
}

export async function provisionOrganization(input: ProvisionOrganizationInput): Promise<ProvisionedOrganization> {
  const schemaName = await generateUniqueSchemaName(input.organizationName);

  await controlPlanePool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  await runMigrateDeploy(schemaName);
  primeClientForSchema(schemaName);

  const userId = await runWithTenant(schemaName, async () => {
    // `prisma` is a Proxy that resolves the current tenant's client on every property access
    // (see config/prisma.ts) — so importing it at module scope is safe even though we're crossing
    // tenants here; nothing actually touches the database until a call happens inside this
    // runWithTenant callback, by which point its ALS context is already active.
    await seedRoles(prisma);
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "Super Admin" } });
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        roleId: superAdminRole.id,
        passwordHash,
        mustChangePassword: false,
      },
    });
    return user.id;
  });

  const org = await createOrganization(input.organizationName, schemaName);
  await registerAccount(input.email, schemaName, org.id);

  return { organizationId: org.id, schemaName, userId };
}
