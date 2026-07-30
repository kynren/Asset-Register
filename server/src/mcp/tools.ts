import { z } from "zod";
import { prisma } from "../config/prisma";
import { isOnline } from "../lib/network";
import { pingHost } from "../lib/ping";
import { computeDueAt } from "../modules/tickets/sla";

export interface ToolResult {
  answer: string;
  data?: unknown;
}

export interface ToolContext {
  actingUserId: number;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: any, ctx: ToolContext) => Promise<ToolResult>;
}

// Every tool here is a thin wrapper over real Prisma queries — the same data the rest of the app
// reads and writes, nothing fabricated or simulated. This is the single source of capabilities
// shared by both the in-app assistant (calling in-process, see mcp/client.ts) and any external
// MCP client (Claude Desktop, Claude Code) connecting over /api/mcp.
export const tools: ToolDef[] = [
  {
    name: "list_assets",
    description: "List assets, optionally filtered by status, category name, or a text search across asset tag/name/serial number.",
    inputSchema: {
      status: z.enum(["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"]).optional().describe("Filter by asset status"),
      categoryName: z.string().optional().describe("Filter by category name, e.g. Laptop"),
      search: z.string().optional().describe("Text search across asset tag, name, serial number"),
      limit: z.number().int().min(1).max(100).default(25),
    },
    handler: async (args) => {
      const where: Record<string, unknown> = {};
      if (args.status) where.status = args.status;
      if (args.categoryName) where.category = { name: { equals: args.categoryName, mode: "insensitive" } };
      if (args.search) {
        where.OR = [
          { assetTag: { contains: args.search, mode: "insensitive" } },
          { name: { contains: args.search, mode: "insensitive" } },
          { serialNumber: { contains: args.search, mode: "insensitive" } },
        ];
      }
      const assets = await prisma.asset.findMany({
        where,
        take: args.limit,
        orderBy: { updatedAt: "desc" },
        select: { assetTag: true, name: true, status: true, category: { select: { name: true } }, assignedTo: { select: { firstName: true, lastName: true } } },
      });
      return {
        answer: assets.length ? `Found ${assets.length} asset(s).` : "No assets matched.",
        data: assets.map((a) => ({
          assetTag: a.assetTag,
          name: a.name,
          status: a.status,
          category: a.category?.name ?? null,
          assignedTo: a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : null,
        })),
      };
    },
  },
  {
    name: "get_asset",
    description: "Get full detail for one asset by its asset tag.",
    inputSchema: { assetTag: z.string().describe("The asset's tag, e.g. KYN-0001") },
    handler: async (args) => {
      const asset = await prisma.asset.findUnique({
        where: { assetTag: args.assetTag },
        include: { category: true, location: true, assignedTo: { select: { firstName: true, lastName: true, email: true } }, device: true },
      });
      if (!asset) return { answer: `No asset found with tag "${args.assetTag}".` };
      return {
        answer: `${asset.name} (${asset.assetTag}) — ${asset.status}, category ${asset.category?.name ?? "none"}.`,
        data: {
          assetTag: asset.assetTag,
          name: asset.name,
          status: asset.status,
          category: asset.category?.name ?? null,
          location: asset.location?.name ?? null,
          assignedTo: asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName} (${asset.assignedTo.email})` : null,
          manufacturer: asset.manufacturer,
          model: asset.model,
          serialNumber: asset.serialNumber,
          warrantyExpiresAt: asset.warrantyExpiresAt,
          nextServiceDate: asset.nextServiceDate,
          device: asset.device ? { hostname: asset.device.hostname, ipAddresses: asset.device.ipAddresses, lastSeen: asset.device.lastSeen } : null,
        },
      };
    },
  },
  {
    name: "asset_stats",
    description: "Get asset counts grouped by status (in use, in storage, in repair, retired, lost).",
    inputSchema: {},
    handler: async () => {
      const groups = await prisma.asset.groupBy({ by: ["status"], _count: { _all: true } });
      const total = groups.reduce((sum, g) => sum + g._count._all, 0);
      return {
        answer: `${total} assets total across the register.`,
        data: { total, byStatus: groups.map((g) => ({ status: g.status, count: g._count._all })) },
      };
    },
  },
  {
    name: "ping_asset",
    description: "Ping an asset live on the network by its asset tag (used as its hostname) and report whether it's reachable and its latency.",
    inputSchema: { assetTag: z.string() },
    handler: async (args) => {
      const asset = await prisma.asset.findUnique({ where: { assetTag: args.assetTag }, select: { assetTag: true } });
      if (!asset) return { answer: `No asset found with tag "${args.assetTag}".` };
      const result = await pingHost(asset.assetTag);
      return {
        answer: result.alive ? `${args.assetTag} is reachable (${result.responseTimeMs}ms).` : `${args.assetTag} did not respond to a ping.`,
        data: result,
      };
    },
  },
  {
    name: "list_open_tickets",
    description: "List open or in-progress helpdesk tickets, optionally only those assigned to the calling user.",
    inputSchema: { assignedToMe: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(25) },
    handler: async (args, ctx) => {
      const where: Record<string, unknown> = { status: { in: ["OPEN", "IN_PROGRESS"] } };
      if (args.assignedToMe) where.assigneeId = ctx.actingUserId;
      const tickets = await prisma.ticket.findMany({
        where,
        take: args.limit,
        orderBy: { createdAt: "desc" },
        select: { ticketNumber: true, title: true, status: true, priority: true, requester: { select: { firstName: true, lastName: true } } },
      });
      return {
        answer: tickets.length ? `${tickets.length} open ticket(s).` : "No open tickets.",
        data: tickets.map((t) => ({ ticketNumber: t.ticketNumber, title: t.title, status: t.status, priority: t.priority, requester: `${t.requester.firstName} ${t.requester.lastName}` })),
      };
    },
  },
  {
    name: "create_ticket",
    description: "Create a new helpdesk ticket, optionally linked to an asset by its asset tag.",
    inputSchema: {
      title: z.string().min(1),
      description: z.string().min(1),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
      assetTag: z.string().optional().describe("Optional asset tag to link this ticket to"),
    },
    handler: async (args, ctx) => {
      let assetId: number | null = null;
      if (args.assetTag) {
        const asset = await prisma.asset.findUnique({ where: { assetTag: args.assetTag }, select: { id: true } });
        if (!asset) return { answer: `No asset found with tag "${args.assetTag}" — ticket not created.` };
        assetId = asset.id;
      }
      const count = await prisma.ticket.count();
      const ticketNumber = `TCK-${String(count + 1).padStart(5, "0")}`;
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber,
          title: args.title,
          description: args.description,
          priority: args.priority,
          assetId,
          requesterId: ctx.actingUserId,
          dueAt: computeDueAt(args.priority),
        },
      });
      return { answer: `Created ticket ${ticket.ticketNumber}: ${ticket.title}.`, data: { ticketNumber: ticket.ticketNumber, id: ticket.id } };
    },
  },
  {
    name: "low_stock_items",
    description: "List stock items that are at or below their reorder level.",
    inputSchema: {},
    handler: async () => {
      const items = await prisma.stockItem.findMany();
      const low = items.filter((i) => i.quantityOnHand <= i.reorderLevel);
      return {
        answer: low.length ? `${low.length} item(s) are at or below their reorder level.` : "No items are currently low on stock.",
        data: low.map((i) => ({ sku: i.sku, name: i.name, quantityOnHand: i.quantityOnHand, reorderLevel: i.reorderLevel })),
      };
    },
  },
  {
    name: "offline_devices",
    description: "List agent-reported devices that have not checked in recently (considered offline).",
    inputSchema: {},
    handler: async () => {
      const devices = await prisma.device.findMany({ select: { hostname: true, lastSeen: true, macAddress: true, ipAddresses: true } });
      const offline = devices.filter((d) => !isOnline(d.lastSeen));
      return {
        answer: offline.length ? `${offline.length} device(s) have not reported in recently.` : "All known devices have reported in recently.",
        data: offline,
      };
    },
  },
  {
    name: "maintenance_due",
    description: "List assets whose next scheduled service date has arrived or passed.",
    inputSchema: {},
    handler: async () => {
      const assets = await prisma.asset.findMany({
        where: { nextServiceDate: { lte: new Date() } },
        select: { assetTag: true, name: true, nextServiceDate: true },
      });
      return {
        answer: assets.length ? `${assets.length} asset(s) are due for maintenance.` : "No assets are currently due for maintenance.",
        data: assets,
      };
    },
  },
  {
    name: "licenses_expiring",
    description: "List software licenses expiring within a given number of days (default 30).",
    inputSchema: { withinDays: z.number().int().min(1).max(365).default(30) },
    handler: async (args) => {
      const cutoff = new Date(Date.now() + args.withinDays * 24 * 60 * 60 * 1000);
      const licenses = await prisma.license.findMany({
        where: { expiresAt: { not: null, lte: cutoff } },
        select: { name: true, vendor: true, expiresAt: true, seats: true },
        orderBy: { expiresAt: "asc" },
      });
      return {
        answer: licenses.length ? `${licenses.length} license(s) expiring within ${args.withinDays} days.` : `No licenses expiring within ${args.withinDays} days.`,
        data: licenses,
      };
    },
  },
  {
    name: "warranties_expiring",
    description: "List assets whose warranty expires within a given number of days (default 30).",
    inputSchema: { withinDays: z.number().int().min(1).max(365).default(30) },
    handler: async (args) => {
      const cutoff = new Date(Date.now() + args.withinDays * 24 * 60 * 60 * 1000);
      const assets = await prisma.asset.findMany({
        where: { warrantyExpiresAt: { not: null, lte: cutoff } },
        select: { assetTag: true, name: true, warrantyExpiresAt: true },
        orderBy: { warrantyExpiresAt: "asc" },
      });
      return {
        answer: assets.length ? `${assets.length} asset(s) with warranty expiring within ${args.withinDays} days.` : `No warranties expiring within ${args.withinDays} days.`,
        data: assets,
      };
    },
  },
  {
    name: "dashboard_summary",
    description: "Get a high-level operational summary: total assets, open/closed tickets, low-stock count, devices seen in the last 24 hours.",
    inputSchema: {},
    handler: async () => {
      const [assetsByStatus, ticketsByStatus, stockItems, devices] = await Promise.all([
        prisma.asset.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.stockItem.findMany(),
        prisma.device.findMany({ select: { lastSeen: true } }),
      ]);
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const devicesSeen24h = devices.filter((d) => d.lastSeen.getTime() >= cutoff).length;
      const lowStockCount = stockItems.filter((i) => i.quantityOnHand <= i.reorderLevel).length;
      const totalAssets = assetsByStatus.reduce((sum, g) => sum + g._count._all, 0);
      const openTickets = ticketsByStatus.filter((g) => g.status === "OPEN" || g.status === "IN_PROGRESS").reduce((sum, g) => sum + g._count._all, 0);
      const closedTickets = ticketsByStatus.filter((g) => g.status === "RESOLVED" || g.status === "CLOSED").reduce((sum, g) => sum + g._count._all, 0);
      const summary = { totalAssets, openTickets, closedTickets, lowStockCount, devicesTotal: devices.length, devicesSeen24h };
      return {
        answer: `${totalAssets} assets, ${openTickets} open tickets, ${lowStockCount} low-stock items, ${devicesSeen24h}/${devices.length} devices seen in the last 24h.`,
        data: summary,
      };
    },
  },
  {
    name: "search_knowledge_base",
    description: "Search the internal knowledge base articles by title or content.",
    inputSchema: { query: z.string().min(1) },
    handler: async (args) => {
      const articles = await prisma.knowledgeArticle.findMany({
        where: { OR: [{ title: { contains: args.query, mode: "insensitive" } }, { content: { contains: args.query, mode: "insensitive" } }] },
        take: 10,
        select: { title: true, category: true, content: true },
      });
      return {
        answer: articles.length ? `${articles.length} article(s) matched "${args.query}".` : `No knowledge base articles matched "${args.query}".`,
        data: articles.map((a) => ({ title: a.title, category: a.category, excerpt: a.content.slice(0, 240) })),
      };
    },
  },
];
