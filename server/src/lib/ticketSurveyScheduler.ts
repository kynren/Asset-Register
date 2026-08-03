import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { notifyUsers } from "./notify";

// Mirrors GLPI's CommonITILObject::cronCreateInquest(): sample a percentage of recently-closed
// tickets, wait `surveyDelayDays` after close before asking, and never ask about a ticket closed
// more than `surveyExpireDays` ago (a ticket that's aged out of the window without being sampled
// simply never gets asked — same as GLPI's max_closedate throttle). `satisfactionAskedAt` is the
// single source of truth for "already decided" so each ticket is only rolled once.
export async function runTicketSurveyCheck(): Promise<number> {
  const settings = await prisma.helpdeskSettings.findUnique({ where: { id: 1 } });
  const sampleRatePercent = settings?.surveySampleRatePercent ?? 100;
  const delayDays = settings?.surveyDelayDays ?? 1;
  const expireDays = settings?.surveyExpireDays ?? 30;

  const now = new Date();
  const delayCutoff = new Date(now.getTime() - delayDays * 24 * 60 * 60 * 1000);
  const expireCutoff = new Date(now.getTime() - expireDays * 24 * 60 * 60 * 1000);

  const eligible = await prisma.ticket.findMany({
    where: {
      status: "CLOSED",
      satisfactionAskedAt: null,
      satisfactionRating: null,
      resolvedAt: { lte: delayCutoff, gte: expireCutoff },
    },
    select: { id: true, ticketNumber: true, title: true, requesterId: true },
  });

  let sent = 0;
  for (const ticket of eligible) {
    // Every eligible ticket gets rolled exactly once, win or lose — marking satisfactionAskedAt
    // regardless of the sampling outcome is what stops it from being re-rolled on every tick.
    await prisma.ticket.update({ where: { id: ticket.id }, data: { satisfactionAskedAt: now } });
    if (Math.random() * 100 >= sampleRatePercent) continue;

    await notifyUsers({
      userIds: [ticket.requesterId],
      kind: "TICKET_WATCHING",
      type: "ticket_satisfaction_request",
      message: `How did we do? Rate your closed ticket ${ticket.ticketNumber}: ${ticket.title}`,
      linkUrl: `/helpdesk/${ticket.id}`,
    });
    sent++;
  }
  return sent;
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startTicketSurveyScheduler(intervalHours = 6) {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(runTicketSurveyCheck).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Ticket survey check failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, intervalHours * 60 * 60 * 1000);
  intervalHandle.unref();
}
