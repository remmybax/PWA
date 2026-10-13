import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/session";
import { fleetBoard } from "@/server/fleet";
import { getStore } from "@/server/store";
import { DeskShell } from "@/components/DeskShell";
import { DateBadge, OverallBadge } from "@/components/badges";
import { Thumbs } from "@/components/Thumbs";
import { isoInZone, relativeDays, usDate } from "@/lib/dates";
import { photoList, progress, totals } from "@/lib/inspection";
import { photoUrl } from "@/lib/client-urls";
import { ChevronLeft } from "@/components/icons";

export const metadata = { title: "Unit" };

export default async function VehiclePage({ params }: PageProps<"/dashboard/trucks/[id]">) {
  const user = await requirePageUser(["manager", "mechanic", "viewer"]);
  const { id } = await params;
  const store = getStore();
  const vehicle = await store.getVehicle(id);
  if (!vehicle) notFound();
  const [board, history] = await Promise.all([fleetBoard(store), store.listInspections({ vehicleId: id })]);
  const status = board.trucks.find((t) => t.truck.id === id) ?? null;
  const docs = board.docs.filter((d) => d.vehicle.id === id);
  const unitOf = (vid: string | null) => board.vehicles.find((v) => v.id === vid)?.unit ?? "";
  const latest = history.find((i) => i.certifiedAt) ?? null;
  const photos = latest ? photoList(latest).map((p) => ({ src: photoUrl(p.key, latest.token), caption: p.item.label, repair: p.repair })) : [];
  const isTruck = vehicle.kind === "truck";

  return (
    <DeskShell user={user} current="/dashboard">
      <Link href="/dashboard" className="btn btn-quiet" style={{ alignSelf: "flex-start" }}>
        <ChevronLeft /> Overview
      </Link>
      <div className="title-row">
        <div>
          <h1 className="heading" style={{ fontSize: 34 }}>
            {isTruck ? "Truck" : "Trailer"} {vehicle.unit}
          </h1>
          <p className="lead">
            {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
            {!vehicle.active ? " · retired" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isTruck && user.role !== "viewer" && (
            <Link href={`/inspect/new?truck=${vehicle.id}`} className="btn btn-orange">
              Inspect this truck
            </Link>
          )}
          {user.role === "manager" && (
            <Link href={`/dashboard/fleet?edit=${vehicle.id}`} className="btn btn-outline">
              Edit details
            </Link>
          )}
        </div>
      </div>

      <div className="two-col">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section className="box box-pad">
            <dl className="kv">
              <div>
                <dt>Unit</dt>
                <dd>{vehicle.unit}</dd>
              </div>
              <div>
                <dt>VIN</dt>
                <dd>{vehicle.vin || "—"}</dd>
              </div>
              <div>
                <dt>Plate</dt>
                <dd>{vehicle.plate || "—"}</dd>
              </div>
              {status && (
                <>
                  <div>
                    <dt>Status</dt>
                    <dd>{status.last ? <OverallBadge overall={status.overall} /> : "No inspection yet"}</dd>
                  </div>
                  <div>
                    <dt>Next inspection</dt>
                    <dd style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {status.due ? usDate(status.due) : "—"} <DateBadge status={status.dueStatus} days={status.dueDays} />
                    </dd>
                  </div>
                  <div>
                    <dt>Usual trailer</dt>
                    <dd>{status.trailer?.unit ?? "None"}</dd>
                  </div>
                </>
              )}
            </dl>
            {vehicle.notes && <p className="lead" style={{ marginTop: 12 }}>{vehicle.notes}</p>}
          </section>

          {status && status.openDefects.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 className="section-label">Open defects</h2>
              <div className="rows">
                {status.openDefects.map((d) => (
                  <Link key={d.item.id} href={`/dashboard/inspections/${status.last!.id}#defects`} className="row-link">
                    <span className="row-main">
                      <span className="row-title" style={{ fontSize: 15 }}>{d.item.label}</span>
                      <span className="row-sub">{d.result.note}</span>
                    </span>
                    <span className="badge badge-warn">Open</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 className="section-label">Latest photos {latest ? `(${usDate(isoInZone(new Date(latest.certifiedAt!)))})` : ""}</h2>
            {photos.length ? <Thumbs photos={photos} captions size={150} /> : <p className="lead">No photos yet.</p>}
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 className="section-label">Documents and dates</h2>
            {docs.length ? (
              <div className="rows">
                {docs.map((d) => (
                  <div key={d.itemId} className="row-link">
                    <span className="row-main">
                      <span className="row-title" style={{ fontSize: 14 }}>{d.label}</span>
                      <span className="row-sub mono">{usDate(d.date)}</span>
                    </span>
                    <span className={`badge ${d.status === "ok" ? "badge-ok" : d.status === "soon" ? "badge-warn" : "badge-bad"}`}>
                      {d.status === "overdue" ? `Expired ${-d.days}d` : relativeDays(d.days)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="lead">Dates show up here after the first signed inspection.</p>
            )}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 className="section-label">Inspection history ({history.length})</h2>
            <div className="rows">
              {history.map((i) => {
                const t = totals(progress(i, isoInZone(new Date())));
                return (
                  <Link key={i.id} href={i.certifiedAt ? `/dashboard/inspections/${i.id}` : "#"} className="row-link">
                    <span className="row-main">
                      <span className="row-title" style={{ fontSize: 15 }}>
                        {usDate(isoInZone(new Date(i.certifiedAt ?? i.startedAt)))}
                        {isTruck ? (i.trailerId ? ` · Trailer ${unitOf(i.trailerId)}` : " · No trailer") : ` · Truck ${unitOf(i.truckId)}`}
                      </span>
                      <span className="row-sub">
                        {i.inspectorName}
                        {i.certifiedAt ? "" : ` · in progress, ${t.done} of ${t.total} done`}
                      </span>
                    </span>
                    {i.certifiedAt ? <OverallBadge overall={i.overall} /> : <span className="badge badge-navy">In progress</span>}
                  </Link>
                );
              })}
              {!history.length && <div className="empty">No inspections yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </DeskShell>
  );
}
