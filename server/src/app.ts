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
import assetIntakePublicRoutes from "./modules/assets/assetIntakePublic.routes";
import assetIntakeAdminRoutes from "./modules/assets/assetIntakeAdmin.routes";
import assetCollectionsRoutes from "./modules/assetCollections/assetCollections.routes";
import locationsRoutes from "./modules/locations/locations.routes";
import assetsRoutes from "./modules/assets/assets.routes";
import devicesRoutes from "./modules/devices/devices.routes";
import agentRoutes from "./modules/devices/agent.routes";
import networkRoutes from "./modules/network/network.routes";
import networkRelayRoutes from "./modules/network/relay.routes";
import stockRoutes from "./modules/stock/stock.routes";
import stockItemTypesRoutes from "./modules/stockItemTypes/stockItemTypes.routes";
import ticketsRoutes from "./modules/tickets/tickets.routes";
import ticketCategoriesRoutes from "./modules/tickets/ticketCategories.routes";
import teamsRoutes from "./modules/tickets/teams.routes";
import emailIngestSettingsRoutes from "./modules/tickets/emailIngestSettings.routes";
import ticketTemplatesRoutes from "./modules/tickets/ticketTemplates.routes";
import ticketSlasRoutes from "./modules/tickets/ticketSlas.routes";
import ticketRecurrencesRoutes from "./modules/tickets/ticketRecurrences.routes";
import ticketRulesRoutes from "./modules/tickets/ticketRules.routes";
import helpdeskSettingsRoutes from "./modules/tickets/helpdeskSettings.routes";
import operationsRoutes from "./modules/operations/operations.routes";
import nvrRoutes from "./modules/nvr/nvr.routes";
import accessControlRoutes from "./modules/accessControl/accessControl.routes";
import lightingRoutes from "./modules/lighting/lighting.routes";
import lightingSiteMapRoutes from "./modules/lighting/siteMap.routes";
import gatesRoutes from "./modules/gates/gates.routes";
import assistantRoutes from "./modules/assistant/assistant.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import savedViewsRoutes from "./modules/savedViews/savedViews.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import preferencesRoutes from "./modules/preferences/preferences.routes";
import changelogRoutes from "./modules/changelog/changelog.routes";
import profileRoutes from "./modules/profile/profile.routes";
import appearanceRoutes from "./modules/appearance/appearance.routes";
import auditRoutes from "./modules/audit/audit.routes";
import settingsRoutes from "./modules/settings/settings.routes";
import settingsPublicRoutes from "./modules/settings/settingsPublic.routes";
import loginDesignRoutes from "./modules/settings/loginDesign.routes";
import mobileSplashRoutes from "./modules/settings/mobileSplash.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import notificationPreferencesRoutes from "./modules/notifications/notificationPreferences.routes";
import commentsRoutes from "./modules/comments/comments.routes";
import recordRulesRoutes from "./modules/automation/recordRules.routes";
import customColumnsRoutes from "./modules/customColumns/customColumns.routes";
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
import databaseManagerRoutes from "./modules/databaseManager/databaseManager.routes";
import mediaCenterRoutes from "./modules/mediaCenter/mediaCenter.routes";
import apiConnectionsRoutes from "./modules/apiConnections/apiConnections.routes";
import apiIntegrationsRoutes from "./modules/apiIntegrations/apiIntegrations.routes";

export function createApp() {
  const app = express();

  // The external API gateway (/api/integrations/v1/*) is deliberately open to any origin — it
  // authenticates via a Bearer token (see apiConnectionAuth.ts), never cookies, so the
  // same-origin protection CORS exists for session/cookie auth doesn't apply here. Registered
  // before the app's own restrictive CORS below so another app's browser-side code calling this
  // gateway directly isn't blocked with a generic "Failed to fetch" the way it otherwise would be
  // — this route only ever serves credential-scoped data, not this app's own session.
  app.use("/api/integrations/v1", cors());

  const allowedOrigins = env.CLIENT_ORIGIN.split(",").map((o) => o.trim());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(morgan("dev"));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Publicly servable, non-sensitive images (branding assets, avatars) — no auth required
  // so they can be used directly in <img>/<link> tags, including on the login screen.
  app.use("/uploads/branding", express.static(path.join(__dirname, "..", "uploads", "branding")));
  app.use("/uploads/mobile-splash", express.static(path.join(__dirname, "..", "uploads", "mobile-splash")));
  app.use("/uploads/avatars", express.static(path.join(__dirname, "..", "uploads", "avatars")));
  app.use("/uploads/assets", express.static(path.join(__dirname, "..", "uploads", "assets")));
  app.use("/uploads/projects", express.static(path.join(__dirname, "..", "uploads", "projects")));
  app.use("/uploads/email-templates", express.static(path.join(__dirname, "..", "uploads", "email-templates")));
  app.use("/uploads/org-logos", express.static(path.join(__dirname, "..", "uploads", "org-logos")));
  app.use("/uploads/lighting-sitemaps", express.static(path.join(__dirname, "..", "uploads", "lighting-sitemaps")));
  app.use("/uploads/media-center", express.static(path.join(__dirname, "..", "uploads", "media-center")));
  app.use("/uploads/stock-attachments", express.static(path.join(__dirname, "..", "uploads", "stock-attachments")));
  app.use("/uploads/stock-signatures", express.static(path.join(__dirname, "..", "uploads", "stock-signatures")));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/roles", rolesRoutes);
  app.use("/api/asset-categories", assetCategoriesRoutes);
  app.use("/api/asset-intake-submissions", assetIntakeAdminRoutes);
  app.use("/api/asset-collections", assetCollectionsRoutes);
  app.use("/api/locations", locationsRoutes);
  app.use("/api/assets", assetsRoutes);
  app.use("/api/asset-resources", assetResourcesRoutes);
  app.use("/api/devices", devicesRoutes);
  app.use("/api/agent", agentRoutes);
  app.use("/api/network", networkRoutes);
  app.use("/api/network-relay", networkRelayRoutes);
  app.use("/api/stock", stockRoutes);
  app.use("/api/stock-item-types", stockItemTypesRoutes);
  app.use("/api/tickets", ticketsRoutes);
  app.use("/api/ticket-categories", ticketCategoriesRoutes);
  app.use("/api/teams", teamsRoutes);
  app.use("/api/email-ingest-settings", emailIngestSettingsRoutes);
  app.use("/api/ticket-templates", ticketTemplatesRoutes);
  app.use("/api/ticket-slas", ticketSlasRoutes);
  app.use("/api/ticket-recurrences", ticketRecurrencesRoutes);
  app.use("/api/ticket-rules", ticketRulesRoutes);
  app.use("/api/helpdesk-settings", helpdeskSettingsRoutes);
  app.use("/api/operations", operationsRoutes);
  app.use("/api/nvr", nvrRoutes);
  app.use("/api/access-control", accessControlRoutes);
  app.use("/api/lighting", lightingRoutes);
  app.use("/api/lighting/site-maps", lightingSiteMapRoutes);
  app.use("/api/gates", gatesRoutes);
  app.use("/api/assistant", assistantRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/saved-views", savedViewsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/preferences", preferencesRoutes);
  app.use("/api/changelog", changelogRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/appearance-themes", appearanceRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/settings/public", settingsPublicRoutes);
  app.use("/api/settings/login-design", loginDesignRoutes);
  app.use("/api/settings/mobile-splash", mobileSplashRoutes);
  app.use("/api/public/asset-intake", assetIntakePublicRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/notification-preferences", notificationPreferencesRoutes);
  app.use("/api/comments", commentsRoutes);
  app.use("/api/record-rules", recordRulesRoutes);
  app.use("/api/custom-columns", customColumnsRoutes);
  app.use("/api/vault", vaultRoutes);
  app.use("/api/system", systemRoutes);
  app.use("/api/licenses", licensesRoutes);
  app.use("/api/procurement", procurementRoutes);
  app.use("/api/asset-form-templates", assetFormTemplatesRoutes);
  app.use("/api/email-templates", emailTemplatesRoutes);
  app.use("/api/backups", backupsRoutes);
  app.use("/api/app-settings", appSettingsRoutes);
  app.use("/api/api-connections", apiConnectionsRoutes);
  app.use("/api/integrations/v1", apiIntegrationsRoutes);
  app.use("/api/scheduled-changes", scheduledChangesRoutes);
  app.use("/api/database", databaseManagerRoutes);
  app.use("/api/media-center", mediaCenterRoutes);
  app.use("/api/toast-settings", toastSettingsRoutes);
  app.use("/api/docs", docsRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/mcp", mcpRoutes);
  app.use("/api/mcp-keys", mcpKeysRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
