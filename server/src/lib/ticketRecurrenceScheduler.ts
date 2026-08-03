import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { applyTicketRules } from "../modules/tickets/ticketRules";
import { computeSlaDueDates, resolveSlaForCategory } from "../modules/tickets/sla";

async function nextTicketNumber(): Promise<string> {
  const count = await prisma.ticket.count();
  return `TCK-${String(count + 1).padStart(5, "0")}`;
}

const NUMERIC_FIELDS = new Set(["categoryId", "assetId", "locationId", "slaId"]);

async function stampOutTicket(recurrence: { id: number; name: string; templateId: number; requesterId: number }): Promise<number> {
  const fields = await prisma.ticketTemplateField.findMany({ where: { templateId: recurrence.templateId, mode: "PREDEFINED" } });

  const data: Record<string, unknown> = {
    title: recurrence.name,
    description: `Auto-created from the recurring ticket schedule "${recurrence.name}".`,
    templateId: recurrence.templateId,
    requesterId: recurrence.requesterId,
  };
  for (const f of fields) {
    if (f.predefinedValue == null) continue;
    data[f.fieldKey] = NUMERIC_FIELDS.has(f.fieldKey) ? Number(f.predefinedValue) : f.predefinedValue;
  }

  await applyTicketRules(data);

  const resolvedSla = data.slaId ? null : await resolveSlaForCategory(data.categoryId as number | null | undefined);
  if (resolvedSla) data.slaId = resolvedSla.id;
  const sla = data.slaId ? await prisma.ticketSla.findUnique({ where: { id: Number(data.slaId) } }) : null;
  const { ttoDueAt, ttrDueAt } = computeSlaDueDates(sla);

  const ticketNumber = await nextTicketNumber();
  const ticket = await prisma.ticket.create({ data: { ...data, ticketNumber, ttoDueAt, ttrDueAt } as any });
  return ticket.id;
}

// Mirrors GLPI's TicketRecurrent/CommonITILRecurrentCron: a day-granularity (not calendar/
// working-hours-aware) periodicity check — see TicketRecurrence's schema comment for the scope
// cut. `createBeforeDays` lets the ticket appear ahead of the actual due occurrence.
export async function runTicketRecurrenceCheck(): Promise<number> {
  const now = new Date();
  const due = await prisma.ticketRecurrence.findMany({
    where: { isActive: true, OR: [{ endDate: null }, { endDate: { gte: now } }] },
  });

  let created = 0;
  for (const recurrence of due) {
    const triggerAt = new Date(recurrence.nextCreationAt.getTime() - recurrence.createBeforeDays * 24 * 60 * 60 * 1000);
    if (triggerAt > now) continue;

    const ticketId = await stampOutTicket(recurrence);
    const nextCreationAt = new Date(recurrence.nextCreationAt.getTime() + recurrence.periodicityDays * 24 * 60 * 60 * 1000);
    await prisma.ticketRecurrence.update({ where: { id: recurrence.id }, data: { nextCreationAt, lastCreatedTicketId: ticketId } });
    created++;
  }
  return created;
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startTicketRecurrenceScheduler(intervalHours = 1) {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(runTicketRecurrenceCheck).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Ticket recurrence check failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, intervalHours * 60 * 60 * 1000);
  intervalHandle.unref();
}
