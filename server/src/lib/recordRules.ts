import { prisma } from "../config/prisma";
import { RecordRuleTrigger } from "@prisma/client";

interface RuleCondition {
  field: string;
  operator: string;
  value: string;
}

interface RuleAction {
  field: string;
  value: string;
}

function matchesCondition(data: Record<string, unknown>, condition: RuleCondition): boolean {
  const actual = data[condition.field];
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

// Generalized counterpart to ticketRules.ts's applyTicketRules — same JSON-condition/JSON-action
// evaluation, but keyed by entityType (RecordRule.entityType, e.g. "Asset"/"StockItem") instead of
// being hardcoded to Ticket, and aware of `trigger` so it can also fire on update, not just create.
// Mutates `data` in place so the caller's subsequent prisma create/update sees the result.
export async function applyRecordRules(
  entityType: string,
  data: Record<string, unknown>,
  trigger: "ON_CREATE" | "ON_UPDATE",
  numericFields: Set<string> = new Set()
): Promise<void> {
  const rules = await prisma.recordRule.findMany({
    where: {
      entityType,
      isActive: true,
      trigger: { in: [trigger as RecordRuleTrigger, "ON_CREATE_OR_UPDATE"] },
    },
    orderBy: { order: "asc" },
  });

  for (const rule of rules) {
    const conditions = rule.conditions as unknown as RuleCondition[];
    const actions = rule.actions as unknown as RuleAction[];
    if (!Array.isArray(conditions) || conditions.length === 0) continue;
    if (!conditions.every((c) => matchesCondition(data, c))) continue;

    for (const action of Array.isArray(actions) ? actions : []) {
      if (!action?.field) continue;
      data[action.field] = numericFields.has(action.field) ? Number(action.value) : action.value;
    }
  }
}
