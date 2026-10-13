import Link from "next/link";
import { requirePageUser } from "@/server/session";
import { getStore } from "@/server/store";
import { DeskShell } from "@/components/DeskShell";
import { OverallBadge } from "@/components/badges";
import { isoInZone, todayISO, usDate } from "@/lib/dates";
import { defects, judgeDay, progress, totals } from "@/lib/inspection";
import type { Overall } from "@/lib/types";
import { DownloadIcon } from "@/components/icons";

export const metadata = { title: "Inspections" };

export default async function Inspections({ searchParams }: PageProps<"/dashboard/inspections">) {
  const user = await requirePageUser(["manager", "mechanic", "viewer"]);
  const sp = await searchParams;
  const unit = typeof sp.unit === "string" ? sp.unit : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : "";
  const store = getStore();
  const [all, vehicles] = await Promise.all([store.listInspections(), store.listVehicles()]);
  const unitOf = (id: string | null) => vehicles.find((v) => v.id === id)?.unit ?? "";
  const today = todayISO();
  const rows = all.filter((i) => {
    if (unit && i.truckId !== unit && i.trailerId !== unit) return false;
    if (status === "draft") return !i.certifiedAt;
    if (status && i.overall !== (status as Overall)) return false;
    if (month && isoInZone(new Date(i.certifiedAt ?? i.startedAt)).slice(0, 7) !== month) return false;
    return true;
  });
  const months = [...new Set(all.map((i) => isoInZone(new Date(i.certifiedAt ?? i.startedAt)).slice(0, 7)))].sort().reverse();
  const units = vehicles.filter((v) => v.active).sort((a, b) => a.kind.localeCompare(b.kind) * -1 || a.unit.localeCompare(b.unit, undefined, { numeric: true }));

  return (
    <DeskShell user={user} current="/dashboard/inspections">
      <div className="title-row">
        <h1 className="heading" style={{ fontSize: 32 }}>Inspections</h1>
        <a href="/dashboard/export" className="btn btn-outline">
          <DownloadIcon /> Export CSV
        </a>
      </div>
      <form className="box box-pad" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
          <span className="field-label">Unit</span>
          <select name="unit" className="input" defaultValue={unit}>
            <option value="">All units</option>
            {units.map((v) => (
              <option key={v.id} value={v.id}>
                {v.kind === "truck" ? "Truck" : "Trailer"} {v.unit}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
          <span className="field-label">Status</span>
          <select name="status" className="input" defaultValue={status}>
            <option value="">Any</option>
            <option value="in_service">In service</option>
            <option value="needs_repair">Needs repair</option>
            <option value="out_of_service">Out of service</option>
            <option value="draft">In progress</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
          <span className="field-label">Month</span>
          <select name="month" className="input" defaultValue={month}>
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m.slice(5)}/{m.slice(0, 4)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary">Filter</button>
        {(unit || status || month) && (
          <Link href="/dashboard/inspections" className="btn btn-quiet">
            Clear
          </Link>
        )}
      </form>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Truck</th>
              <th>Trailer</th>
              <th>Inspector</th>
              <th>Location</th>
              <th>Status</th>
              <th>Defects</th>
              <th>Photos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const fails = i.certifiedAt ? defects(i, judgeDay(i, today)) : [];
              const open = fails.filter((d) => !d.resolved).length;
              const photos = Object.values(i.results).reduce((n, r) => n + r.photos.length, 0);
              const t = totals(progress(i, today));
              return (
                <tr key={i.id} className="clickable">
                  <td className="num">
                    {i.certifiedAt ? (
                      <Link href={`/dashboard/inspections/${i.id}`} className="cell-link">
                        {usDate(isoInZone(new Date(i.certifiedAt)))}
                      </Link>
                    ) : (
                      usDate(isoInZone(new Date(i.startedAt)))
                    )}
                  </td>
                  <td>
                    <Link href={`/dashboard/trucks/${i.truckId}`}>{unitOf(i.truckId)}</Link>
                  </td>
                  <td>{i.trailerId ? <Link href={`/dashboard/trucks/${i.trailerId}`}>{unitOf(i.trailerId)}</Link> : "—"}</td>
                  <td>{i.inspectorName}</td>
                  <td>{i.location || "—"}</td>
                  <td>{i.certifiedAt ? <OverallBadge overall={i.overall} /> : <span className="badge badge-navy">In progress {t.done}/{t.total}</span>}</td>
                  <td className="num">
                    {fails.length ? (
                      <>
                        {fails.length}
                        {open ? <span className="badge badge-warn" style={{ marginLeft: 6 }}>{open} open</span> : <span className="badge badge-ok" style={{ marginLeft: 6 }}>fixed</span>}
                      </>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="num">{photos}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty">No inspections match.</div>}
      </div>
    </DeskShell>
  );
}
