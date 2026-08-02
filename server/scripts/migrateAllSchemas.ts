// Run once after shipping a schema change (like the ScheduledChange model) to apply pending
// Prisma migrations to every existing organization's schema — org provisioning only ever runs
// `migrate deploy` once, at creation time, so schemas created before a later migration never
// pick it up on their own.
//
// Usage:  npm run migrate:all-schemas -w server   (from the repo root)
//     or  tsx scripts/migrateAllSchemas.ts (from server/)
import { listOrganizations } from "../src/config/controlPlane";
import { runMigrateDeploy } from "../src/lib/tenantProvisioning";

async function main() {
  const orgs = await listOrganizations();
  console.log(`Found ${orgs.length} organization schema(s) to migrate.`);

  let succeeded = 0;
  let failed = 0;
  for (const org of orgs) {
    try {
      await runMigrateDeploy(org.schemaName);
      console.log(`  ✓ ${org.name} (${org.schemaName})`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${org.name} (${org.schemaName}):`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`Done. ${succeeded} succeeded, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("migrateAllSchemas failed:", err);
  process.exit(1);
});
