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
