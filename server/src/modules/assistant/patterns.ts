import { Request } from "express";
import { callInternalTool } from "../../mcp/client";

export interface AssistantResult {
  answer: string;
  data?: unknown;
}

interface Pattern {
  regex: RegExp;
  quickLabel: string;
  /** Excluded from the quick-action suggestion chips (needs free-text the user has to type themselves). */
  hidden?: boolean;
  handler: (req: Request, match: RegExpMatchArray) => Promise<AssistantResult>;
}

// Every handler below calls out through the same MCP tool layer used by external MCP clients
// (see server/src/mcp) instead of querying Prisma directly — the assistant is an MCP client of
// its own app. Still rule-based (a regex decides which tool to call), not an LLM, per the scope
// agreed for this pass: no external API key, no per-query cost, but a much bigger set of
// recognized questions and actions than before.
export const patterns: Pattern[] = [
  {
    regex: /how many assets? (are |is )?in repair/i,
    quickLabel: "How many assets are in repair?",
    handler: async (req) => callInternalTool(req.user!.id, "asset_stats", {}).then((r) => pickStatusAnswer(r, "IN_REPAIR", "in repair")),
  },
  {
    regex: /how many assets?( do we have)?$|total assets/i,
    quickLabel: "How many assets do we have in total?",
    handler: async (req) => callInternalTool(req.user!.id, "asset_stats", {}),
  },
  {
    regex: /how many assets? (are |is )?(in storage|stored)/i,
    quickLabel: "How many assets are in storage?",
    handler: async (req) => callInternalTool(req.user!.id, "asset_stats", {}).then((r) => pickStatusAnswer(r, "IN_STORAGE", "in storage")),
  },
  {
    regex: /how many assets? (are |is )?retired/i,
    quickLabel: "How many assets are retired?",
    handler: async (req) => callInternalTool(req.user!.id, "asset_stats", {}).then((r) => pickStatusAnswer(r, "RETIRED", "retired")),
  },
  {
    regex: /how many assets? (are |is )?lost/i,
    quickLabel: "How many assets are lost?",
    handler: async (req) => callInternalTool(req.user!.id, "asset_stats", {}).then((r) => pickStatusAnswer(r, "LOST", "lost")),
  },
  {
    regex: /list (laptops?|desktops?|monitors?|printers?|servers?|mobile devices?)/i,
    quickLabel: "List all laptops",
    hidden: true,
    handler: async (req, match) => callInternalTool(req.user!.id, "list_assets", { categoryName: singularizeCategory(match[1]) }),
  },
  {
    regex: /(find|search|look ?up|show me) asset[s]? (matching |called |named |for )?["']?([\w .-]{2,40})["']?/i,
    quickLabel: "Search assets by name or tag",
    hidden: true,
    handler: async (req, match) => callInternalTool(req.user!.id, "list_assets", { search: match[3].trim() }),
  },
  {
    regex: /(details? (for|on)|get asset|show asset)\s+([\w-]{2,30})/i,
    quickLabel: "Get details for asset tag KYN-0001",
    hidden: true,
    handler: async (req, match) => callInternalTool(req.user!.id, "get_asset", { assetTag: match[3].trim() }),
  },
  {
    regex: /ping\s+([\w-]{2,30})/i,
    quickLabel: "Ping asset tag KYN-0001",
    hidden: true,
    handler: async (req, match) => callInternalTool(req.user!.id, "ping_asset", { assetTag: match[1].trim() }),
  },
  {
    regex: /open tickets (assigned to me|for me)/i,
    quickLabel: "Open tickets assigned to me",
    handler: async (req) => callInternalTool(req.user!.id, "list_open_tickets", { assignedToMe: true }),
  },
  {
    regex: /open tickets/i,
    quickLabel: "How many open tickets are there?",
    handler: async (req) => callInternalTool(req.user!.id, "list_open_tickets", {}),
  },
  {
    regex: /create (a )?ticket[:\s]+(.+)/i,
    quickLabel: 'Create a ticket: "Printer on 3rd floor jammed"',
    hidden: true,
    handler: async (req, match) => {
      const title = match[2].trim().slice(0, 120);
      return callInternalTool(req.user!.id, "create_ticket", { title, description: match[2].trim() });
    },
  },
  {
    regex: /low stock/i,
    quickLabel: "What items are low on stock?",
    handler: async (req) => callInternalTool(req.user!.id, "low_stock_items", {}),
  },
  {
    regex: /devices (offline|not seen|missing)/i,
    quickLabel: "Which devices are offline?",
    handler: async (req) => callInternalTool(req.user!.id, "offline_devices", {}),
  },
  {
    regex: /maintenance due|service due/i,
    quickLabel: "What maintenance is due?",
    handler: async (req) => callInternalTool(req.user!.id, "maintenance_due", {}),
  },
  {
    regex: /licen[sc]es? expir/i,
    quickLabel: "Which licenses are expiring soon?",
    handler: async (req) => callInternalTool(req.user!.id, "licenses_expiring", { withinDays: 30 }),
  },
  {
    regex: /warrant(y|ies) expir/i,
    quickLabel: "Which warranties are expiring soon?",
    handler: async (req) => callInternalTool(req.user!.id, "warranties_expiring", { withinDays: 30 }),
  },
  {
    regex: /(dashboard|status) (summary|overview)|how (are things|is everything)/i,
    quickLabel: "Give me a status overview",
    handler: async (req) => callInternalTool(req.user!.id, "dashboard_summary", {}),
  },
  {
    regex: /(kb|knowledge base|how do i|how to)\s+(.+)/i,
    quickLabel: "How do I reset a password?",
    hidden: true,
    handler: async (req, match) => callInternalTool(req.user!.id, "search_knowledge_base", { query: match[2].trim() }),
  },
];

export const quickActions = patterns.filter((p) => !p.hidden).map((p) => p.quickLabel);

function pickStatusAnswer(result: AssistantResult, status: string, label: string): AssistantResult {
  const byStatus = (result.data as { byStatus?: { status: string; count: number }[] })?.byStatus ?? [];
  const count = byStatus.find((s) => s.status === status)?.count ?? 0;
  return { answer: `There ${count === 1 ? "is" : "are"} ${count} asset${count === 1 ? "" : "s"} currently ${label}.`, data: { count } };
}

function singularizeCategory(word: string): string {
  const map: Record<string, string> = {
    laptops: "Laptop", laptop: "Laptop",
    desktops: "Desktop", desktop: "Desktop",
    monitors: "Monitor", monitor: "Monitor",
    printers: "Printer", printer: "Printer",
    servers: "Server", server: "Server",
    "mobile devices": "Mobile Device", "mobile device": "Mobile Device",
  };
  return map[word.toLowerCase()] ?? word;
}

export async function runAssistantQuery(req: Request, text: string): Promise<AssistantResult> {
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) return pattern.handler(req, match);
  }
  return {
    answer:
      "I didn't understand that. Try one of the quick actions below, or ask about assets (by status, category, tag, or a ping), tickets, licenses, warranties, stock, offline devices, maintenance, the knowledge base, or say \"create a ticket: ...\".",
  };
}
