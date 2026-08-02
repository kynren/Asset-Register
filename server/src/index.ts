import { createApp } from "./app";
import { env } from "./config/env";
import { startMaintenanceAlertScheduler } from "./lib/maintenanceAlerts";
import { startOverdueTaskScheduler } from "./lib/overdueTaskAlerts";
import { startRetentionScheduler } from "./lib/recording";
import { startNetworkMonitorScheduler } from "./lib/networkMonitor";
import { startLightingAutomationScheduler } from "./lib/lightingAutomationScheduler";
import { startSystemStatusScheduler } from "./lib/systemStatusMonitor";
import { backfillHarnessPermission } from "./lib/backfillHarnessPermission";
import { startBackupScheduler } from "./lib/backupScheduler";

const app = createApp();

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
});
