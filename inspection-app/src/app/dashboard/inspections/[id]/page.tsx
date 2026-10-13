import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/session";
import { canResolve } from "@/server/inspections";
import { visibleInspection } from "@/server/view";
import { qrSvg, reportUrl } from "@/server/links";
import { isoInZone, usDate } from "@/lib/dates";
import { DeskShell } from "@/components/DeskShell";
import { ReportView } from "@/components/ReportView";
import { LabelMaker } from "@/components/LabelMaker";
import { ChevronLeft, PrintIcon } from "@/components/icons";
import { ResolveDefect } from "./ResolveDefect";

export const metadata = { title: "Inspection" };

export default async function InspectionDetail({ params }: PageProps<"/dashboard/inspections/[id]">) {
  const user = await requirePageUser(["manager", "mechanic", "viewer"]);
  const { id } = await params;
  const view = await visibleInspection(user, id);
  const { insp } = view;
  if (!insp.certifiedAt) notFound();
  const url = await reportUrl(insp.token);
  const svg = await qrSvg(url);
  const resolver = canResolve(user);
  const date = usDate(isoInZone(new Date(insp.certifiedAt)));

  return (
    <DeskShell user={user} current="/dashboard/inspections">
      <Link href={`/dashboard/trucks/${insp.truckId}`} className="btn btn-quiet" style={{ alignSelf: "flex-start" }}>
        <ChevronLeft /> Truck {view.truck?.unit}
      </Link>
      <div className="two-col" style={{ gridTemplateColumns: "minmax(0, 1.8fr) minmax(280px, 1fr)" }}>
        <div id="defects">
          <ReportView
            insp={insp}
            truck={view.truck}
            trailer={view.trailer}
            defectAction={resolver ? (itemId, resolved) => <ResolveDefect inspectionId={insp.id} itemId={itemId} resolved={resolved} stamp={`Truck ${view.truck?.unit} repair`} /> : undefined}
          />
        </div>
        <aside style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 16 }}>
          <section className="box box-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="section-label">QR code</h2>
            <div style={{ width: 160, height: 160, alignSelf: "center" }} dangerouslySetInnerHTML={{ __html: svg }} />
            <a href={`/r/${insp.token}`} className="btn btn-outline">
              Open the QR page
            </a>
            <a href={`/r/${insp.token}/print`} className="btn btn-primary">
              <PrintIcon /> Printable report
            </a>
          </section>
          <section className="box box-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="section-label">Label for the Nelko printer</h2>
            <LabelMaker
              url={url}
              unit={view.truck?.unit ?? "?"}
              trailer={view.trailer?.unit ?? ""}
              date={date}
              fileName={`truck-${view.truck?.unit ?? "x"}-${isoInZone(new Date(insp.certifiedAt))}`}
            />
          </section>
        </aside>
      </div>
    </DeskShell>
  );
}
