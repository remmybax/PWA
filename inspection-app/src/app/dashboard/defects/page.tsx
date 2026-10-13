import Link from "next/link";
import { requirePageUser } from "@/server/session";
import { getStore } from "@/server/store";
import { fleetBoard } from "@/server/fleet";
import { DeskShell } from "@/components/DeskShell";
import { OverallBadge } from "@/components/badges";
import { Thumbs } from "@/components/Thumbs";
import { daysBetween, isoInZone, usDate, usDateTime } from "@/lib/dates";
import { defects, judgeDay } from "@/lib/inspection";
import { photoUrl } from "@/lib/client-urls";

export const metadata = { title: "Defects" };

/** The shop's worklist: open defects from each truck's latest inspection, oldest first, plus recent repairs. */
export default async function Defects() {
  const user = await requirePageUser(["manager", "mechanic", "viewer"]);
  const store = getStore();
  const board = await fleetBoard(store);
  const open = [...board.defects].sort((a, b) => a.inspection.certifiedAt!.localeCompare(b.inspection.certifiedAt!));
  const all = await store.listInspections({ certified: true });
  const repaired = all
    .flatMap((i) => defects(i, judgeDay(i, board.today)).filter((d) => d.resolved).map((d) => ({ i, d })))
    .sort((a, b) => b.d.result.resolution!.at.localeCompare(a.d.result.resolution!.at))
    .slice(0, 15);
  const unitOf = (id: string | null) => board.vehicles.find((v) => v.id === id)?.unit ?? "";

  return (
    <DeskShell user={user} current="/dashboard/defects">
      <div>
        <h1 className="heading" style={{ fontSize: 32 }}>Defects</h1>
        <p className="lead">
          Open items from each truck&apos;s latest inspection, oldest first. {user.role !== "viewer" ? "Open one to mark it repaired." : ""}
        </p>
      </div>
      {open.length === 0 ? (
        <div className="note-ok">No open defects.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {open.map(({ inspection, truck, defect }) => {
            const age = daysBetween(isoInZone(new Date(inspection.certifiedAt!)), board.today);
            return (
              <div key={`${inspection.id}-${defect.item.id}`} className="box box-pad" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 260px", gap: 16, borderLeft: "4px solid var(--orange-dark)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Link href={`/dashboard/trucks/${truck.id}`} className="heading" style={{ fontSize: 22, textDecoration: "none" }}>
                      Truck {truck.unit}
                    </Link>
                    <OverallBadge overall={inspection.overall} />
                    <span className="badge badge-grey">Open {age} day{age === 1 ? "" : "s"}</span>
                  </div>
                  <div style={{ fontWeight: 600 }}>{defect.item.label}</div>
                  <div style={{ color: "var(--orange-ink)" }}>{defect.result.note}</div>
                  <div className="row-sub">
                    Found by {inspection.inspectorName} on {usDateTime(inspection.certifiedAt!)} · {defect.section.title}
                  </div>
                  <Link href={`/dashboard/inspections/${inspection.id}#defects`} className="btn btn-outline" style={{ alignSelf: "flex-start", marginTop: 4 }}>
                    {user.role === "viewer" ? "Open inspection" : "Open to mark repaired"}
                  </Link>
                </div>
                <Thumbs photos={defect.result.photos.map((p) => ({ src: photoUrl(p.key, inspection.token), caption: defect.item.label }))} size={120} />
              </div>
            );
          })}
        </div>
      )}

      <h2 className="section-label" style={{ marginTop: 12 }}>Recently repaired</h2>
      {repaired.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Repaired</th>
                <th>Truck</th>
                <th>Item</th>
                <th>What was done</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {repaired.map(({ i, d }) => (
                <tr key={`${i.id}-${d.item.id}`}>
                  <td className="num">{usDate(isoInZone(new Date(d.result.resolution!.at)))}</td>
                  <td>
                    <Link href={`/dashboard/inspections/${i.id}`}>{unitOf(i.truckId)}</Link>
                  </td>
                  <td>{d.item.label}</td>
                  <td>{d.result.resolution!.note}</td>
                  <td>{d.result.resolution!.byName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="lead">Nothing repaired yet.</p>
      )}
    </DeskShell>
  );
}
