import Link from "next/link";
import { requirePageUser } from "@/server/session";
import { fleetBoard } from "@/server/fleet";
import { getStore } from "@/server/store";
import { DeskShell } from "@/components/DeskShell";
import { DateBadge, OverallBadge } from "@/components/badges";
import { isoInZone, relativeDays, usDate } from "@/lib/dates";
import { DownloadIcon } from "@/components/icons";

export const metadata = { title: "Fleet dashboard" };

export default async function Dashboard() {
  const user = await requirePageUser(["manager", "mechanic", "viewer"]);
  const board = await fleetBoard(getStore());
  const unitOf = (id: string | null) => board.vehicles.find((v) => v.id === id)?.unit ?? "";
  const dueSoon = board.trucks.filter((t) => t.dueStatus === "soon").length;
  const overdue = board.trucks.filter((t) => t.dueStatus === "overdue" || t.dueStatus === "never").length;
  const oos = board.trucks.filter((t) => t.overall === "out_of_service").length;
  const docsSoon = board.docs.filter((d) => d.status === "soon").length;
  const docsOver = board.docs.filter((d) => d.status === "overdue").length;
  const attention = [
    ...board.trucks
      .filter((t) => t.overall === "out_of_service")
      .map((t) => ({ key: `oos-${t.truck.id}`, href: `/dashboard/trucks/${t.truck.id}`, text: `Truck ${t.truck.unit} is out of service`, sub: `${t.openDefects.length} open defect(s)`, bad: true })),
    ...board.trucks
      .filter((t) => t.dueStatus === "overdue" || t.dueStatus === "never")
      .map((t) => ({
        key: `due-${t.truck.id}`,
        href: `/dashboard/trucks/${t.truck.id}`,
        text: t.dueStatus === "never" ? `Truck ${t.truck.unit} has never been inspected` : `Truck ${t.truck.unit} inspection overdue`,
        sub: t.due ? `Was due ${usDate(t.due)}` : "No inspection on record",
        bad: true,
      })),
    ...board.docs
      .filter((d) => d.status !== "ok")
      .map((d) => ({
        key: `doc-${d.vehicle.id}-${d.itemId}`,
        href: `/dashboard/trucks/${d.vehicle.id}`,
        text: `${d.vehicle.kind === "truck" ? "Truck" : "Trailer"} ${d.vehicle.unit}: ${d.label}`,
        sub: `${d.status === "overdue" ? "Expired" : "Expires"} ${usDate(d.date)} (${relativeDays(d.days)})`,
        bad: d.status === "overdue",
      })),
  ];

  return (
    <DeskShell user={user} current="/dashboard">
      <div className="title-row">
        <div>
          <h1 className="heading" style={{ fontSize: 32 }}>Fleet overview</h1>
          <p className="lead">Monthly inspections, open defects and paperwork dates for every truck. Today is {usDate(board.today)}.</p>
        </div>
        <a href="/dashboard/export" className="btn btn-outline">
          <DownloadIcon /> Export CSV
        </a>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Trucks</span>
          <span className="tile-num">{board.trucks.length}</span>
        </div>
        <Link href="#trucks" className={`tile ${overdue ? "tile-warn" : ""}`}>
          <span className="tile-label">Inspections overdue</span>
          <span className="tile-num">{overdue}</span>
        </Link>
        <Link href="#trucks" className="tile">
          <span className="tile-label">Due in 30 days</span>
          <span className="tile-num">{dueSoon}</span>
        </Link>
        <Link href="/dashboard/defects" className={`tile ${oos ? "tile-warn" : ""}`}>
          <span className="tile-label">Out of service</span>
          <span className="tile-num">{oos}</span>
        </Link>
        <Link href="/dashboard/defects" className={`tile ${board.defects.length ? "tile-warn" : ""}`}>
          <span className="tile-label">Open defects</span>
          <span className="tile-num">{board.defects.length}</span>
        </Link>
        <Link href="/dashboard/documents" className={`tile ${docsOver ? "tile-warn" : ""}`}>
          <span className="tile-label">Documents expired / due</span>
          <span className="tile-num">
            {docsOver} / {docsSoon}
          </span>
        </Link>
      </div>

      <div className="two-col">
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }} id="trucks">
          <h2 className="section-label">Trucks</h2>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Status</th>
                  <th>Last inspected</th>
                  <th>Next due</th>
                  <th>Defects</th>
                  <th>Docs</th>
                </tr>
              </thead>
              <tbody>
                {board.trucks.map((t) => (
                  <tr key={t.truck.id} className="clickable">
                    <td>
                      <Link href={`/dashboard/trucks/${t.truck.id}`} className="cell-link">
                        {t.truck.unit}
                      </Link>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {t.trailer ? `Trailer ${t.trailer.unit}` : "No trailer"}
                        {t.draft ? " · in progress" : ""}
                      </div>
                    </td>
                    <td>{t.last ? <OverallBadge overall={t.overall} /> : <span className="badge badge-grey">No record</span>}</td>
                    <td className="num">
                      {t.last ? (
                        <Link href={`/dashboard/inspections/${t.last.id}`}>{usDate(isoInZone(new Date(t.last.certifiedAt!)))}</Link>
                      ) : (
                        "—"
                      )}
                      {t.last && <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-body)" }}>{t.last.inspectorName}</div>}
                    </td>
                    <td>
                      <div className="num">{t.due ? usDate(t.due) : "—"}</div>
                      <DateBadge status={t.dueStatus} days={t.dueDays} />
                    </td>
                    <td className="num">{t.openDefects.length ? <span className="badge badge-warn">{t.openDefects.length} open</span> : "0"}</td>
                    <td>
                      {t.docsOverdue ? <span className="badge badge-bad">{t.docsOverdue} expired</span> : null} {t.docsSoon ? <span className="badge badge-warn">{t.docsSoon} soon</span> : null}
                      {!t.docsOverdue && !t.docsSoon ? <span className="badge badge-ok">OK</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="section-label">Needs attention ({attention.length})</h2>
          {attention.length ? (
            <div className="rows">
              {attention.map((a) => (
                <Link key={a.key} href={a.href} className="row-link" style={{ borderLeft: `4px solid ${a.bad ? "var(--orange-dark)" : "var(--orange-line)"}` }}>
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 15 }}>{a.text}</span>
                    <span className="row-sub">{a.sub}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="note-ok">Nothing needs attention.</div>
          )}

          <h2 className="section-label" style={{ marginTop: 12 }}>Recent inspections</h2>
          <div className="rows">
            {board.recent.slice(0, 8).map((i) => (
              <Link key={i.id} href={i.certifiedAt ? `/dashboard/inspections/${i.id}` : `/dashboard/trucks/${i.truckId}`} className="row-link">
                <span className="row-main">
                  <span className="row-title" style={{ fontSize: 15 }}>
                    Truck {unitOf(i.truckId)}
                    {i.trailerId ? ` · ${unitOf(i.trailerId)}` : ""}
                  </span>
                  <span className="row-sub">
                    {usDate(isoInZone(new Date(i.certifiedAt ?? i.startedAt)))} · {i.inspectorName}
                  </span>
                </span>
                {i.certifiedAt ? <OverallBadge overall={i.overall} /> : <span className="badge badge-navy">In progress</span>}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </DeskShell>
  );
}
