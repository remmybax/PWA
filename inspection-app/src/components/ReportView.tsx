// The full inspection report: status, defects, paperwork dates, supplies and every checklist answer
// with its photos. Used by the QR page, the inspector's "done" screen and the dashboard.

import { sectionsFor } from "@/lib/checklist";
import { addMonths, isoInZone, longDate, relativeDays, usDate, usDateTime } from "@/lib/dates";
import { answerText, dateStatus, defects, judgeDay, verdictOf } from "@/lib/inspection";
import type { Inspection, Vehicle } from "@/lib/types";
import { photoUrl } from "@/lib/client-urls";
import { OverallBadge } from "./badges";
import { Thumbs } from "./Thumbs";
import { CheckIcon, WarnIcon } from "./icons";
import styles from "./report.module.css";

function vehicleLine(v: Vehicle | null): string {
  if (!v) return "—";
  return [v.year, v.make, v.model].filter(Boolean).join(" ") || "—";
}

export function ReportView({
  insp,
  truck,
  trailer,
  defectAction,
}: {
  insp: Inspection;
  truck: Vehicle | null;
  trailer: Vehicle | null;
  /** Extra controls under each defect (the dashboard's "Mark repaired"). */
  defectAction?: (itemId: string, resolved: boolean) => React.ReactNode;
}) {
  const day = judgeDay(insp, isoInZone(new Date()));
  const today = isoInZone(new Date());
  const sections = sectionsFor(Boolean(insp.trailerId));
  const fails = defects(insp, day);
  const open = fails.filter((d) => !d.resolved);
  const photosOf = (id: string) => (insp.results[id]?.photos ?? []).map((p) => ({ src: photoUrl(p.key, insp.token), caption: "" }));
  const r = (id: string) => insp.results[id];
  const docs = sections.flatMap((s) => s.items).filter((i) => i.kind === "doc");
  const supplies = sections.find((s) => s.id === "supplies")?.items ?? [];
  const nextDue = insp.certifiedAt ? addMonths(isoInZone(new Date(insp.certifiedAt)), 1) : null;

  return (
    <div className={styles.report}>
      <section className={styles.head}>
        <div className={styles.headTop}>
          <div>
            <div className={styles.kicker}>Monthly vehicle inspection</div>
            <h1 className={styles.unit}>
              Truck {truck?.unit ?? "?"}
              {trailer ? <span className={styles.trailer}> · Trailer {trailer.unit}</span> : <span className={styles.trailer}> · No trailer</span>}
            </h1>
          </div>
          <div className={styles.status}>
            <OverallBadge overall={insp.overall} />
            {open.length > 0 && <span className="badge badge-warn">{open.length} open defect{open.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
        <dl className="kv">
          <div>
            <dt>Inspected</dt>
            <dd>{insp.certifiedAt ? usDateTime(insp.certifiedAt) : "Not signed off"}</dd>
          </div>
          <div>
            <dt>Inspector</dt>
            <dd>{insp.inspectorName}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{insp.location || "—"}</dd>
          </div>
          <div>
            <dt>Odometer</dt>
            <dd>{r("odometer")?.value ? `${Number(r("odometer")!.value).toLocaleString("en-US")} mi` : "—"}</dd>
          </div>
          <div>
            <dt>Engine hours</dt>
            <dd>{r("engine-hours")?.value ? Number(r("engine-hours")!.value).toLocaleString("en-US") : "—"}</dd>
          </div>
          <div>
            <dt>Next inspection due</dt>
            <dd>{nextDue ? usDate(nextDue) : "—"}</dd>
          </div>
          <div>
            <dt>Truck</dt>
            <dd>{vehicleLine(truck)}</dd>
          </div>
          <div>
            <dt>Truck VIN</dt>
            <dd>{truck?.vin || "—"}</dd>
          </div>
          {trailer && (
            <>
              <div>
                <dt>Trailer</dt>
                <dd>{vehicleLine(trailer)}</dd>
              </div>
              <div>
                <dt>Trailer VIN</dt>
                <dd>{trailer.vin || "—"}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      <section className={styles.block}>
        <h2 className="section-label">Defects</h2>
        {fails.length === 0 ? (
          <div className="note-ok">No defects. Every item passed.</div>
        ) : (
          <div className={styles.defects}>
            {fails.map((d) => (
              <div key={d.item.id} className={`${styles.defect} ${d.resolved ? styles.defectFixed : ""}`}>
                <div className={styles.defectHead}>
                  {d.resolved ? <CheckIcon size={18} color="var(--ok)" /> : <WarnIcon size={18} color="var(--orange-dark)" />}
                  <div className={styles.defectText}>
                    <div className={styles.defectLabel}>{d.item.label}</div>
                    <div className={styles.defectSub}>
                      {d.section.short} · {answerText(d.item, d.result, day)}
                    </div>
                    {d.result.note && <div className={styles.defectNote}>{d.result.note}</div>}
                  </div>
                  <span className={`badge ${d.resolved ? "badge-ok" : "badge-warn"}`}>{d.resolved ? "Repaired" : "Open"}</span>
                </div>
                <Thumbs photos={photosOf(d.item.id)} size={110} />
                {d.result.resolution && (
                  <div className={styles.resolution}>
                    <strong>Repaired</strong> by {d.result.resolution.byName} on {usDateTime(d.result.resolution.at)}: {d.result.resolution.note}
                    {d.result.resolution.photo && (
                      <div style={{ marginTop: 8 }}>
                        <Thumbs photos={[{ src: photoUrl(d.result.resolution.photo.key, insp.token), caption: d.item.label, repair: true }]} size={110} />
                      </div>
                    )}
                  </div>
                )}
                {defectAction?.(d.item.id, d.resolved)}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.block}>
        <h2 className="section-label">Paperwork and dates</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Document</th>
                <th>On truck</th>
                <th>Expires / due</th>
                <th>Photo</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((item) => {
                const res = r(item.id);
                const v = verdictOf(item, res, day);
                const ds = res?.date ? dateStatus(res.date, today) : null;
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.label}</td>
                    <td>
                      {v === "na" ? (
                        <span className="badge badge-grey">N/A</span>
                      ) : res?.verdict === "fail" ? (
                        <span className="badge badge-bad">Missing</span>
                      ) : res?.verdict === "pass" ? (
                        <span className="badge badge-ok">Present</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">
                      {res?.date ? (
                        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {usDate(res.date)}
                          {ds && ds.status !== "ok" && (
                            <span className={`badge ${ds.status === "overdue" ? "badge-bad" : "badge-warn"}`}>
                              {ds.status === "overdue" ? `Past due ${-ds.days}d` : relativeDays(ds.days)}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ width: 90 }}>
                      <Thumbs photos={photosOf(item.id).slice(0, 1)} size={72} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {supplies.length > 0 && (
        <section className={styles.block}>
          <h2 className="section-label">Supplies inventory</h2>
          <div className={styles.supplies}>
            {supplies.map((item) => {
              const v = verdictOf(item, r(item.id), day);
              return (
                <div key={item.id} className={styles.supply}>
                  <span className={styles.supplyMark} data-v={v ?? "none"}>
                    {v === "pass" ? "✓" : v === "fail" ? "✕" : v === "na" ? "–" : "?"}
                  </span>
                  <span className={styles.supplyLabel}>{item.label}</span>
                  <span className={styles.supplyVal}>{answerText(item, r(item.id), day)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className={styles.block}>
        <h2 className="section-label">Full checklist</h2>
        {sections.map((s) => (
          <details key={s.id} className={styles.section} open={s.id !== "paperwork" && s.id !== "supplies"}>
            <summary className={styles.sectionHead}>
              <span>{s.title}</span>
              <span className="mono" style={{ fontSize: 13, color: "var(--muted)" }}>
                {s.items.filter((i) => verdictOf(i, r(i.id), day) === "fail").length || "No"} fail
                {s.items.filter((i) => verdictOf(i, r(i.id), day) === "fail").length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className={styles.items}>
              {s.items.map((item) => {
                const res = r(item.id);
                const v = verdictOf(item, res, day);
                return (
                  <div key={item.id} className={styles.itemRow}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemLabel}>{item.label}</div>
                      {res?.note && <div className={styles.itemNote}>{res.note}</div>}
                    </div>
                    <span className={`badge ${v === "pass" ? "badge-ok" : v === "fail" ? (res?.resolution ? "badge-navy" : "badge-bad") : "badge-grey"}`}>
                      {answerText(item, res, day)}
                      {v === "fail" && res?.resolution ? " · repaired" : ""}
                    </span>
                    {res && res.photos.length > 0 && (
                      <div className={styles.itemPhotos}>
                        <Thumbs photos={photosOf(item.id)} size={64} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </section>

      <section className={styles.block}>
        <h2 className="section-label">Comments and sign-off</h2>
        <div className="box box-pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ whiteSpace: "pre-wrap" }}>{insp.comments || <span style={{ color: "var(--muted)" }}>No comments.</span>}</div>
          {insp.certifiedAt && (
            <div style={{ fontSize: 14, color: "var(--ink-2)" }}>
              Signed by <strong>{insp.signature}</strong> on {longDate(isoInZone(new Date(insp.certifiedAt)))}. This report is locked and can&apos;t be changed.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
