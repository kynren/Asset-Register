import { prisma } from "../../config/prisma";

const SLA_HOURS: Record<string, number> = {
  URGENT: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 120,
};

export function computeDueAt(priority: string, from: Date = new Date()): Date {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.MEDIUM;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

interface ResolvedSla {
  id: number;
  ttoMinutes: number | null;
  ttrMinutes: number;
}

// A category's `defaultSlaId` is the only auto-assignment path (mirrors GLPI's category-driven
// SLA default) — an explicit `slaId` on the create/update payload always wins over this.
export async function resolveSlaForCategory(categoryId: number | null | undefined): Promise<ResolvedSla | null> {
  if (!categoryId) return null;
  const category = await prisma.ticketCategory.findUnique({ where: { id: categoryId }, select: { defaultSlaId: true } });
  if (!category?.defaultSlaId) return null;
  return prisma.ticketSla.findUnique({ where: { id: category.defaultSlaId } });
}

// A deliberately simplified, calendar-time (not business-hours-aware) due date — see the
// GLPI-parity research summary for why the working-hours calendar math was cut from scope.
export function computeSlaDueDates(sla: ResolvedSla | null, from: Date = new Date()): { ttoDueAt: Date | null; ttrDueAt: Date | null } {
  if (!sla) return { ttoDueAt: null, ttrDueAt: null };
  return {
    ttoDueAt: sla.ttoMinutes != null ? new Date(from.getTime() + sla.ttoMinutes * 60_000) : null,
    ttrDueAt: new Date(from.getTime() + sla.ttrMinutes * 60_000),
  };
}
