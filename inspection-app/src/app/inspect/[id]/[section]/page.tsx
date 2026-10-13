import { notFound } from "next/navigation";
import { sectionsFor } from "@/lib/checklist";
import { todayISO } from "@/lib/dates";
import { requirePageUser } from "@/server/session";
import { ownDraftView, unitLine } from "@/server/view";
import { SectionScreen } from "./SectionScreen";

export const metadata = { title: "Inspection" };

export default async function SectionPage({ params }: PageProps<"/inspect/[id]/[section]">) {
  const user = await requirePageUser(["driver", "manager", "mechanic"]);
  const { id, section } = await params;
  const view = await ownDraftView(user, id);
  const hasTrailer = Boolean(view.insp.trailerId);
  if (!sectionsFor(hasTrailer).some((s) => s.id === section)) notFound();
  return (
    <main className="phone">
      <SectionScreen
        key={section}
        inspectionId={id}
        sectionId={section}
        hasTrailer={hasTrailer}
        initial={view.insp.results}
        stamp={`Truck ${view.truck?.unit ?? "?"}${view.trailer ? `/${view.trailer.unit}` : ""}`}
        unitLine={unitLine(view)}
        today={todayISO()}
      />
    </main>
  );
}
