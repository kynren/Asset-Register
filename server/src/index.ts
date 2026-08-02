import { createApp } from "./app";
import { env } from "./config/env";
import { bootstrapControlPlane } from "./config/controlPlane";
import { startMaintenanceAlertScheduler } from "./lib/maintenanceAlerts";
import { startOverdueTaskScheduler } from "./lib/overdueTaskAlerts";
import { startRetentionScheduler } from "./lib/recording";
import { startNetworkMonitorScheduler } from "./lib/networkMonitor";
import { startLightingAutomationScheduler } from "./lib/lightingAutomationScheduler";
import { startSystemStatusScheduler } from "./lib/systemStatusMonitor";
import { backfillHarnessPermission } from "./lib/backfillHarnessPermission";
import { backfillSystemAdmin } from "./lib/backfillSystemAdmin";
import { startBackupScheduler } from "./lib/backupScheduler";

const app = createApp();

// Must run before the app accepts traffic or any scheduler ticks — it's what creates the control
// plane tables (organizations/account_index/token_index) and registers the pre-existing `public`
// schema as Organization #1, so login and every per-org scheduler loop have something to resolve.
bootstrapControlPlane()
  .then(() => {
    app.listen(env.PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Kynren Asset Register API listening on http://localhost:${env.PORT}`);
      startMaintenanceAlertScheduler();
      startOverdueTaskScheduler();
      startRetentionScheduler();
      startNetworkMonitorScheduler();
      startLightingAutomationScheduler();
      startSystemStatusScheduler();
      startBackupScheduler();
      backfillHarnessPermission().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("Harness permission backfill failed:", err);
      });
      backfillSystemAdmin().catch((err) => {
        // eslint-disable-next-line no-console
        console.error("System Admin backfill failed:", err);
      });
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to bootstrap control plane — server not started:", err);
    process.exit(1);
  });
