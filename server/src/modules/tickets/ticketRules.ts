import { prisma } from "../../config/prisma";

interface RuleCondition {
  field: string;
  operator: string;
  value: string;
}

interface RuleAction {
  field: string;
  value: string;
}

// Fields whose action value should be coerced to a number before being written into the ticket
// draft (every FK column a rule action is allowed to set).
const NUMERIC_FIELDS = new Set(["categoryId", "assetId", "locationId", "templateId", "slaId"]);

function matchesCondition(ticket: Record<string, unknown>, condition: RuleCondition): boolean {
  const actual = ticket[condition.field];
  const expected = condition.value;
  switch (condition.operator) {
    case "equals":
      return String(actual ?? "") === expected;
    case "not_equals":
      return String(actual ?? "") !== expected;
    case "contains":
      return typeof actual === "string" && actual.toLowerCase().includes(expected.toLowerCase());
    case "is_empty":
      return actual == null || actual === "";
    case "is_not_empty":
      return actual != null && actual !== "";
    default:
      return false;
  }
}

// A JSON-condition/JSON-action simplification of GLPI's RuleTicket/RuleCriteria/RuleAction class
// hierarchy — evaluated synchronously against a draft ticket (before it's persisted), same timing
// as GLPI's rules running inline in the ticket add/update flow. Rules run in `order`; a later
// rule's actions can override an earlier one's, same "last match wins" semantics as GLPI.
// Mutates `data` in place so the caller's subsequent `prisma.ticket.create` sees the result.
export async function applyTicketRules(data: Record<string, unknown>): Promise<void> {
  const rules = await prisma.ticketRule.findMany({ where: { isActive: true }, orderBy: { order: "asc" } });

  for (const rule of rules) {
    const conditions = rule.conditions as unknown as RuleCondition[];
    const actions = rule.actions as unknown as RuleAction[];
    if (!Array.isArray(conditions) || conditions.length === 0) continue;
    if (!conditions.every((c) => matchesCondition(data, c))) continue;

    for (const action of Array.isArray(actions) ? actions : []) {
      if (!action?.field) continue;
      data[action.field] = NUMERIC_FIELDS.has(action.field) ? Number(action.value) : action.value;
    }
  }
}
