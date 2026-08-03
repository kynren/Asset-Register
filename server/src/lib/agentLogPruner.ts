import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";

// Keeps AgentLogEntry from growing unbounded — the relay agent uploads a batch of lines every
// ~30s (see relay.routes.ts's POST /log), so without pruning this table grows forever. Same
// runForEachOrganization sweep pattern every other scheduler in this codebase uses.
const PRUNE_TICK_MS = 60 * 60 * 1000;
const RETAIN_MS = 24 * 60 * 60 * 1000;

async function pruneOldEntries(): Promise<void> {
  await prisma.agentLogEntry.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETAIN_MS) } } });
}

let pruneIntervalHandle: NodeJS.Timeout | null = null;

export function startAgentLogPruneScheduler() {
  if (pruneIntervalHandle) return;
  const run = () => {
    runForEachOrganization(pruneOldEntries).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Agent log prune failed:", err);
    });
  };
  run();
  pruneIntervalHandle = setInterval(run, PRUNE_TICK_MS);
  pruneIntervalHandle.unref();
}
