import dayjs from "dayjs";

function daysUntil(dateStr: string): number {
  return dayjs(dateStr).startOf("day").diff(dayjs().startOf("day"), "day");
}

// Date + compliance-urgency badge for any expiry-labeled field — expired (red), due within 30
// days (amber), otherwise fine (green). Generalizes what was previously a Harness-only cell.
export function ExpiryCell({ value }: { value: string | null }) {
  if (!value) return <span className="muted">—</span>;
  const days = daysUntil(value);
  const tone = days < 0 ? "badge-danger" : days <= 30 ? "badge-warning" : "badge-success";
  const title = days < 0 ? `Expired ${Math.abs(days)} day(s) ago` : `${days} day(s) remaining`;
  return (
    <span className={`badge ${tone}`} title={title}>
      {dayjs(value).format("DD MMM YYYY")}
    </span>
  );
}
