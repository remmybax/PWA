import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStore } from "@/server/store";
import { viewOf } from "@/server/view";
import { ReportView } from "@/components/ReportView";
import { PrintIcon } from "@/components/icons";
import { usDate, isoInZone } from "@/lib/dates";

export const metadata: Metadata = { title: "Inspection report", robots: { index: false, follow: false } };

/**
 * What the QR sticker opens. No sign-in: whoever has the paper report (and so the QR's long random
 * link) can read this one report. Nothing here can be changed, and no other report is reachable.
 */
export default async function PublicReport({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const store = getStore();
  const insp = await store.getInspectionByToken(token);
  if (!insp || !insp.certifiedAt) notFound();
  const view = await viewOf(insp);
  const newer = (await store.listInspections({ truckId: insp.truckId, certified: true }))[0];
  const superseded = newer && newer.id !== insp.id ? newer : null;

  return (
    <main className="desk">
      <header className="appbar desk-bar">
        <img src="/indeca-logo.png" alt="Indeca Crude Xpress" />
        <a href={`/r/${token}/print`} className="btn btn-outline">
          <PrintIcon /> Printable report
        </a>
      </header>
      <div className="desk-main" style={{ maxWidth: 960 }}>
        <div className="note-info">Read-only inspection report, opened from its QR code.</div>
        {superseded && (
          <div className="note-warn">
            <strong>This is not the latest inspection.</strong> Truck {view.truck?.unit} was inspected again on {usDate(isoInZone(new Date(superseded.certifiedAt!)))}.
          </div>
        )}
        <ReportView insp={insp} truck={view.truck} trailer={view.trailer} />
      </div>
    </main>
  );
}
