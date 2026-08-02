import "express-async-errors";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import rolesRoutes from "./modules/roles/roles.routes";
import assetCategoriesRoutes from "./modules/assetCategories/assetCategories.routes";
import locationsRoutes from "./modules/locations/locations.routes";
import assetsRoutes from "./modules/assets/assets.routes";
import devicesRoutes from "./modules/devices/devices.routes";
import agentRoutes from "./modules/devices/agent.routes";
import networkRoutes from "./modules/network/network.routes";
import networkRelayRoutes from "./modules/network/relay.routes";
import stockRoutes from "./modules/stock/stock.routes";
import ticketsRoutes from "./modules/tickets/tickets.routes";
import ticketCategoriesRoutes from "./modules/tickets/ticketCategories.routes";
import operationsRoutes from "./modules/operations/operations.routes";
import nvrRoutes from "./modules/nvr/nvr.routes";
import accessControlRoutes from "./modules/accessControl/accessControl.routes";
import lightingRoutes from "./modules/lighting/lighting.routes";
import assistantRoutes from "./modules/assistant/assistant.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import preferencesRoutes from "./modules/preferences/preferences.routes";
import profileRoutes from "./modules/profile/profile.routes";
import auditRoutes from "./modules/audit/audit.routes";
import settingsRoutes from "./modules/settings/settings.routes";
import settingsPublicRoutes from "./modules/settings/settingsPublic.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import vaultRoutes from "./modules/vault/vault.routes";
import systemRoutes from "./modules/system/system.routes";
import assetResourcesRoutes from "./modules/assetResources/assetResources.routes";
import licensesRoutes from "./modules/licenses/licenses.routes";
import procurementRoutes from "./modules/procurement/procurement.routes";
import assetFormTemplatesRoutes from "./modules/assetFormTemplates/assetFormTemplates.routes";
import emailTemplatesRoutes from "./modules/emailTemplates/emailTemplates.routes";
import docsRoutes from "./modules/docs/docs.routes";
import searchRoutes from "./modules/search/search.routes";
import mcpRoutes from "./mcp/mcp.routes";
import mcpKeysRoutes from "./mcp/mcpKeys.routes";
import backupsRoutes from "./modules/backups/backups.routes";
import toastSettingsRoutes from "./modules/toastSettings/toastSettings.routes";
import appSettingsRoutes from "./modules/appSettings/appSettings.routes";
import scheduledChangesRoutes from "./modules/scheduledChanges/scheduledChanges.routes";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(morgan("dev"));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Publicly servable, non-sensitive images (branding assets, avatars) — no auth required
  // so they can be used directly in <img>/<link> tags, including on the login screen.
  app.use("/uploads/branding", express.static(path.join(__dirname, "..", "uploads", "branding")));
  app.use("/uploads/avatars", express.static(path.join(__dirname, "..", "uploads", "avatars")));
  app.use("/uploads/assets", express.static(path.join(__dirname, "..", "uploads", "assets")));
  app.use("/uploads/email-templates", express.static(path.join(__dirname, "..", "uploads", "email-templates")));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/roles", rolesRoutes);
  app.use("/api/asset-categories", assetCategoriesRoutes);
  app.use("/api/locations", locationsRoutes);
  app.use("/api/assets", assetsRoutes);
  app.use("/api/asset-resources", assetResourcesRoutes);
  app.use("/api/devices", devicesRoutes);
  app.use("/api/agent", agentRoutes);
  app.use("/api/network", networkRoutes);
  app.use("/api/network-relay", networkRelayRoutes);
  app.use("/api/stock", stockRoutes);
  app.use("/api/tickets", ticketsRoutes);
  app.use("/api/ticket-categories", ticketCategoriesRoutes);
  app.use("/api/operations", operationsRoutes);
  app.use("/api/nvr", nvrRoutes);
  app.use("/api/access-control", accessControlRoutes);
  app.use("/api/lighting", lightingRoutes);
  app.use("/api/assistant", assistantRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/preferences", preferencesRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/settings/public", settingsPublicRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/vault", vaultRoutes);
  app.use("/api/system", systemRoutes);
  app.use("/api/licenses", licensesRoutes);
  app.use("/api/procurement", procurementRoutes);
  app.use("/api/asset-form-templates", assetFormTemplatesRoutes);
  app.use("/api/email-templates", emailTemplatesRoutes);
  app.use("/api/backups", backupsRoutes);
  app.use("/api/app-settings", appSettingsRoutes);
  app.use("/api/scheduled-changes", scheduledChangesRoutes);
  app.use("/api/toast-settings", toastSettingsRoutes);
  app.use("/api/docs", docsRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/mcp", mcpRoutes);
  app.use("/api/mcp-keys", mcpKeysRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
