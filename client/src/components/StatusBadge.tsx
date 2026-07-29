const TONE_MAP: Record<string, string> = {
  IN_USE: "badge-success",
  IN_STORAGE: "badge-neutral",
  IN_REPAIR: "badge-warning",
  RETIRED: "badge-neutral",
  LOST: "badge-danger",
  OPEN: "badge-primary",
  IN_PROGRESS: "badge-warning",
  RESOLVED: "badge-success",
  CLOSED: "badge-neutral",
  LOW: "badge-neutral",
  MEDIUM: "badge-primary",
  HIGH: "badge-warning",
  URGENT: "badge-danger",
  ONLINE: "badge-success",
  OFFLINE: "badge-danger",
  UNKNOWN: "badge-neutral",
  ACTIVE: "badge-success",
  INACTIVE: "badge-neutral",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = TONE_MAP[status] ?? "badge-neutral";
  return <span className={`badge ${cls}`}>{status.replace(/_/g, " ")}</span>;
}
