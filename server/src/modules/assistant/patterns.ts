import { Request } from "express";
import { prisma } from "../../config/prisma";
import { isOnline } from "../../lib/network";

export interface AssistantResult {
  answer: string;
  data?: unknown;
}

interface Pattern {
  regex: RegExp;
  quickLabel: string;
  handler: (req: Request, match: RegExpMatchArray) => Promise<AssistantResult>;
}

export const patterns: Pattern[] = [
  {
    regex: /how many assets? (are |is )?in repair/i,
    quickLabel: "How many assets are in repair?",
    handler: async () => {
      const count = await prisma.asset.count({ where: { status: "IN_REPAIR" } });
      return { answer: `There ${count === 1 ? "is" : "are"} ${count} asset${count === 1 ? "" : "s"} currently in repair.`, data: { count } };
    },
  },
  {
    regex: /how many assets?( do we have)?$|total assets/i,
    quickLabel: "How many assets do we have in total?",
    handler: async () => {
      const count = await prisma.asset.count();
      return { answer: `There are ${count} assets in the register.`, data: { count } };
    },
  },
  {
    regex: /open tickets (assigned to me|for me)/i,
    quickLabel: "Open tickets assigned to me",
    handler: async (req) => {
      const tickets = await prisma.ticket.findMany({
        where: { assigneeId: req.user!.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { id: true, ticketNumber: true, title: true, status: true, priority: true },
        orderBy: { createdAt: "desc" },
      });
      return {
        answer: tickets.length ? `You have ${tickets.length} open ticket(s) assigned to you.` : "You have no open tickets assigned to you.",
        data: tickets,
      };
    },
  },
  {
    regex: /low stock/i,
    quickLabel: "What items are low on stock?",
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
    regex: /devices (offline|not seen|missing)/i,
    quickLabel: "Which devices are offline?",
    handler: async () => {
      const devices = await prisma.device.findMany({ select: { hostname: true, lastSeen: true, macAddress: true } });
      const offline = devices.filter((d) => !isOnline(d.lastSeen));
      return {
        answer: offline.length ? `${offline.length} device(s) have not reported in recently.` : "All known devices have reported in recently.",
        data: offline,
      };
    },
  },
  {
    regex: /maintenance due|service due/i,
    quickLabel: "What maintenance is due?",
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
    regex: /open tickets/i,
    quickLabel: "How many open tickets are there?",
    handler: async () => {
      const count = await prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } });
      return { answer: `There are ${count} open ticket(s) across the helpdesk.`, data: { count } };
    },
  },
];

export const quickActions = patterns.map((p) => p.quickLabel);

export async function runAssistantQuery(req: Request, text: string): Promise<AssistantResult> {
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) return pattern.handler(req, match);
  }
  return {
    answer: "I didn't understand that. Try one of the quick actions below, or ask about assets in repair, open tickets, low stock, offline devices, or maintenance due.",
  };
}
