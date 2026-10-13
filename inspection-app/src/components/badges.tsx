import type { Overall } from "@/lib/types";
import { OVERALL_LABEL } from "@/lib/types";
import type { DateStatus } from "@/lib/inspection";
import { relativeDays } from "@/lib/dates";

export function OverallBadge({ overall }: { overall: Overall | null }) {
  if (!overall) return <span className="badge badge-grey">Not signed off</span>;
  const cls = overall === "in_service" ? "badge-ok" : overall === "needs_repair" ? "badge-warn" : "badge-bad";
  const text = overall === "needs_repair" ? "Needs repair" : OVERALL_LABEL[overall];
  return <span className={`badge ${cls}`}>{text}</span>;
}

export function DateBadge({ status, days }: { status: DateStatus | "never"; days: number | null }) {
  if (status === "never") return <span className="badge badge-bad">Never inspected</span>;
  const cls = status === "ok" ? "badge-ok" : status === "soon" ? "badge-warn" : "badge-bad";
  const text = status === "overdue" ? `Overdue ${-(days ?? 0)}d` : days === null ? "" : relativeDays(days);
  return <span className={`badge ${cls}`}>{text}</span>;
}
