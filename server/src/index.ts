import { createApp } from "./app";
import { env } from "./config/env";
import { startMaintenanceAlertScheduler } from "./lib/maintenanceAlerts";
import { startRetentionScheduler } from "./lib/recording";

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Kynren Asset Register API listening on http://localhost:${env.PORT}`);
  startMaintenanceAlertScheduler();
  startRetentionScheduler();
});
