import Link from "next/link";
import { requirePageUser } from "@/server/session";
import { getStore } from "@/server/store";
import { fleetBoard } from "@/server/fleet";
import { DeskShell } from "@/components/DeskShell";
import { relativeDays, usDate } from "@/lib/dates";
import { WARN_DAYS } from "@/lib/inspection";

export const metadata = { title: "Documents" };

/** Every expiration and due date recorded on the latest inspections, soonest first. */
export default async function Documents({ searchParams }: PageProps<"/dashboard/documents">) {
  const user = await requirePageUser(["manager", "mechanic", "viewer"]);
  const { show } = await searchParams;
  const board = await fleetBoard(getStore());
  const filter = show === "all" ? "all" : "attention";
  const rows = board.docs.filter((d) => filter === "all" || d.status !== "ok");

  return (
    <DeskShell user={user} current="/dashboard/documents">
      <div>
        <h1 className="heading" style={{ fontSize: 32 }}>Documents and dates</h1>
        <p className="lead">
          Registration, insurance, annual inspections, tank tests and the rest, from each unit&apos;s latest inspection. Anything within {WARN_DAYS} days is flagged.
        </p>
      </div>
      <div className="seg" style={{ maxWidth: 420 }}>
        <a href="/dashboard/documents" aria-current={filter === "attention" ? "page" : undefined}>
          Expired or due soon ({board.docs.filter((d) => d.status !== "ok").length})
        </a>
        <a href="/dashboard/documents?show=all" aria-current={filter === "all" ? "page" : undefined}>
          All ({board.docs.length})
        </a>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Document</th>
              <th>Expires / due</th>
              <th>When</th>
              <th>Recorded on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={`${d.vehicle.id}-${d.itemId}`}>
                <td>
                  <Link href={`/dashboard/trucks/${d.vehicle.id}`} className="cell-link">
                    {d.vehicle.kind === "truck" ? "Truck" : "Trailer"} {d.vehicle.unit}
                  </Link>
                </td>
                <td>{d.label}</td>
                <td className="num">{usDate(d.date)}</td>
                <td>
                  <span className={`badge ${d.status === "ok" ? "badge-ok" : d.status === "soon" ? "badge-warn" : "badge-bad"}`}>
                    {d.status === "overdue" ? `Expired ${-d.days} days ago` : relativeDays(d.days)}
                  </span>
                </td>
                <td>
                  <Link href={`/dashboard/inspections/${d.inspectionId}`}>Inspection</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">{filter === "all" ? "No dates recorded yet." : "Nothing expired or due in the next 30 days."}</div>}
      </div>
    </DeskShell>
  );
}
