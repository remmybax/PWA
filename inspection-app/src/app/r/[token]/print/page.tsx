import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sectionsFor } from "@/lib/checklist";
import { isoInZone, usDate, usDateTime } from "@/lib/dates";
import { answerText, defects, judgeDay, verdictOf } from "@/lib/inspection";
import { OVERALL_LABEL, type Overall } from "@/lib/types";
import { getStore } from "@/server/store";
import { viewOf } from "@/server/view";
import { qrSvg, reportUrl } from "@/server/links";
import { PrintButton } from "./PrintButton";
import styles from "./print.module.css";

export const metadata: Metadata = { title: "Printable report", robots: { index: false, follow: false } };

const STATUSES: Overall[] = ["in_service", "needs_repair", "out_of_service"];

/**
 * The paper report, laid out for US Letter. The box at the top right is sized for the 50 × 30 mm
 * QR label; ?qr=1 prints the QR code straight into it instead.
 */
export default async function PrintReport({ params, searchParams }: PageProps<"/r/[token]/print">) {
  const { token } = await params;
  const { qr } = await searchParams;
  const insp = await getStore().getInspectionByToken(token);
  if (!insp || !insp.certifiedAt) notFound();
  const { truck, trailer } = await viewOf(insp);
  const day = judgeDay(insp, isoInZone(new Date()));
  const sections = sectionsFor(Boolean(insp.trailerId));
  const fails = defects(insp, day);
  const url = await reportUrl(token);
  const printQr = qr === "1";
  const svg = printQr ? await qrSvg(url) : "";
  const r = (id: string) => insp.results[id];
  const docs = sections.flatMap((s) => s.items).filter((i) => i.kind === "doc");
  const supplies = sections.find((s) => s.id === "supplies")?.items ?? [];
  const walk = sections.filter((s) => s.id !== "paperwork" && s.id !== "supplies");
  const mark = (v: string | undefined) => (v === "pass" ? "✓" : v === "fail" ? "✕" : v === "na" ? "N/A" : "");

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <PrintButton />
        <a href={printQr ? `?` : `?qr=1`} className="btn btn-quiet">
          {printQr ? "Leave the box empty for a sticker" : "Print the QR code on the page instead"}
        </a>
        <a href={`/r/${token}`} className="btn btn-quiet">
          Back to report
        </a>
      </div>

      <article className={styles.page}>
        <header className={styles.head}>
          <div className={styles.brand}>
            <img src="/indeca-logo.png" alt="Indeca Crude Xpress" className={styles.logo} />
            <div>
              <h1 className={styles.title}>Monthly Vehicle Inspection</h1>
              <div className={styles.subtitle}>
                Truck {truck?.unit}
                {trailer ? ` · Trailer ${trailer.unit}` : " · No trailer"} · {usDate(isoInZone(new Date(insp.certifiedAt)))}
              </div>
            </div>
          </div>
          <div className={styles.qrBox} aria-label="QR label goes here">
            {printQr ? <div className={styles.qr} dangerouslySetInnerHTML={{ __html: svg }} /> : <span>Place QR label here</span>}
          </div>
        </header>

        <section className={styles.grid4}>
          <Field label="Truck unit" value={truck?.unit} />
          <Field label="Year / make / model" value={[truck?.year, truck?.make, truck?.model].filter(Boolean).join(" ")} />
          <Field label="Truck VIN" value={truck?.vin} mono />
          <Field label="Plate" value={truck?.plate} mono />
          <Field label="Trailer unit" value={trailer?.unit ?? "None"} />
          <Field label="Trailer" value={trailer ? [trailer.year, trailer.make, trailer.model].filter(Boolean).join(" ") : "—"} />
          <Field label="Trailer VIN" value={trailer?.vin} mono />
          <Field label="Trailer plate" value={trailer?.plate} mono />
          <Field label="Inspected" value={usDateTime(insp.certifiedAt)} mono />
          <Field label="Inspector" value={insp.inspectorName} />
          <Field label="Location" value={insp.location} />
          <Field label="Odometer / engine hrs" value={`${r("odometer")?.value ?? "—"} mi / ${r("engine-hours")?.value ?? "—"}`} mono />
        </section>

        <section className={styles.statusRow}>
          <span className={styles.label}>Status</span>
          {STATUSES.map((s) => (
            <span key={s} className={`${styles.check} ${insp.overall === s ? styles.checked : ""}`}>
              <span className={styles.box}>{insp.overall === s ? "✕" : ""}</span>
              {OVERALL_LABEL[s]}
            </span>
          ))}
        </section>

        <section>
          <h2 className={styles.h2}>Defects ({fails.length})</h2>
          {fails.length === 0 ? (
            <p className={styles.none}>None. Every item passed.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: "34%" }}>Item</th>
                  <th>Problem</th>
                  <th style={{ width: "26%" }}>Repaired</th>
                </tr>
              </thead>
              <tbody>
                {fails.map((d) => (
                  <tr key={d.item.id}>
                    <td>{d.item.label}</td>
                    <td>{[answerText(d.item, d.result, day), d.result.note].filter(Boolean).join(" — ")}</td>
                    <td>{d.result.resolution ? `${d.result.resolution.byName}, ${usDate(isoInZone(new Date(d.result.resolution.at)))}: ${d.result.resolution.note}` : "Open"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className={styles.cols}>
          <section>
            <h2 className={styles.h2}>Paperwork and dates</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Document</th>
                  <th style={{ width: 52 }}>On truck</th>
                  <th style={{ width: 82 }}>Exp / due</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((item) => {
                  const res = r(item.id);
                  return (
                    <tr key={item.id}>
                      <td>{item.label}</td>
                      <td className={styles.c}>{res?.verdict === "pass" ? "✓" : res?.verdict === "fail" ? "Missing" : res?.verdict === "na" ? "N/A" : ""}</td>
                      <td className={styles.mono}>{res?.date ? usDate(res.date) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <section>
            <h2 className={styles.h2}>Supplies inventory</h2>
            <table className={styles.table}>
              <tbody>
                {supplies.map((item) => {
                  const v = verdictOf(item, r(item.id), day);
                  return (
                    <tr key={item.id}>
                      <td>{item.label}</td>
                      <td className={`${styles.c} ${styles.mono}`} style={{ width: 70 }}>
                        {item.kind === "count" ? `${r(item.id)?.value ?? "—"}/${item.expected}` : mark(v)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>

        <section>
          <h2 className={styles.h2}>Walk-around and cab</h2>
          <div className={styles.walk}>
            {walk.map((s) => (
              <div key={s.id} className={styles.walkSection}>
                <div className={styles.walkTitle}>{s.title}</div>
                {s.items.map((item) => {
                  const res = r(item.id);
                  const v = verdictOf(item, res, day);
                  const val = item.kind === "check" ? mark(v) : answerText(item, res, day);
                  return (
                    <div key={item.id} className={`${styles.walkRow} ${v === "fail" ? styles.walkFail : ""}`}>
                      <span>{item.label}</span>
                      <span className={styles.mono}>{val}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={styles.h2}>Comments</h2>
          <div className={styles.comments}>{insp.comments || " "}</div>
        </section>

        <section className={styles.signs}>
          <div>
            <div className={styles.signLine}>{insp.signature}</div>
            <div className={styles.label}>Inspector signature (signed in app {usDateTime(insp.certifiedAt)})</div>
          </div>
          <div>
            <div className={styles.signLine} />
            <div className={styles.label}>Reviewed by / date</div>
          </div>
        </section>

        <footer className={styles.foot}>
          <span>Photos and full details: scan the QR code or open {url}</span>
          <span>{photoCount(insp.results)} photos on file · checklist {insp.checklistVersion}</span>
        </footer>
      </article>
    </div>
  );
}

function photoCount(results: Record<string, { photos: unknown[] }>): number {
  return Object.values(results).reduce((n, r) => n + r.photos.length, 0);
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className={styles.field}>
      <div className={styles.label}>{label}</div>
      <div className={mono ? styles.mono : undefined}>{value || "—"}</div>
    </div>
  );
}
