import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/session";
import { unitLine, visibleInspection } from "@/server/view";
import { qrSvg, reportUrl } from "@/server/links";
import { isoInZone, usDate } from "@/lib/dates";
import { AppBar } from "@/components/AppBar";
import { LabelMaker } from "@/components/LabelMaker";
import { ReportView } from "@/components/ReportView";
import { CheckIcon, ChevronLeft, PrintIcon, QrIcon } from "@/components/icons";

export const metadata = { title: "Inspection signed" };

export default async function Done({ params, searchParams }: PageProps<"/inspect/[id]/done">) {
  const user = await requirePageUser();
  const { id } = await params;
  const { new: justSigned } = await searchParams;
  const view = await visibleInspection(user, id);
  const { insp } = view;
  if (!insp.certifiedAt) redirect(`/inspect/${id}`);
  const url = await reportUrl(insp.token);
  const svg = await qrSvg(url);
  const date = usDate(isoInZone(new Date(insp.certifiedAt)));

  return (
    <main className="phone" style={{ maxWidth: 720 }}>
      <AppBar user={user} />
      <div className="body-pad">
        <Link href={user.role === "driver" ? "/" : `/dashboard/inspections/${id}`} className="btn btn-quiet" style={{ alignSelf: "flex-start" }}>
          <ChevronLeft /> {user.role === "driver" ? "Home" : "Dashboard view"}
        </Link>

        {justSigned && (
          <div className="note-ok" role="status" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16 }}>
            <CheckIcon /> Signed and locked. Thank you.
          </div>
        )}

        <div>
          <h1 className="heading" style={{ fontSize: 28 }}>QR label and report</h1>
          <p className="lead">{unitLine(view)} · {date}</p>
        </div>

        <section className="box box-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <QrIcon /> 1. Print the QR sticker
          </h2>
          <LabelMaker
            url={url}
            unit={view.truck?.unit ?? "?"}
            trailer={view.trailer?.unit ?? ""}
            date={date}
            fileName={`truck-${view.truck?.unit ?? "x"}-${isoInZone(new Date(insp.certifiedAt))}`}
          />
        </section>

        <section className="box box-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PrintIcon /> 2. Print the paper report
          </h2>
          <p className="lead" style={{ fontSize: 14 }}>
            One page with the status, defects, paperwork dates and supplies. There&apos;s a box at the top right for the sticker.
          </p>
          <a href={`/r/${insp.token}/print`} className="btn btn-primary" target="_blank" rel="noopener">
            <PrintIcon /> Open printable report
          </a>
        </section>

        <section className="box box-pad" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 120, height: 120 }} dangerouslySetInnerHTML={{ __html: svg }} />
          <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>What the QR opens</div>
            <p className="lead" style={{ fontSize: 14 }}>
              This report, read-only, for anyone holding the paper. No sign-in needed, and it can&apos;t be changed.
            </p>
            <a href={`/r/${insp.token}`} className="btn btn-outline" style={{ alignSelf: "flex-start" }}>
              Open the QR page
            </a>
          </div>
        </section>

        <ReportView insp={insp} truck={view.truck} trailer={view.trailer} />
      </div>
    </main>
  );
}
