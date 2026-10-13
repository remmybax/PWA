import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/session";
import { ownDraftView, unitLine } from "@/server/view";
import { certify } from "@/server/inspections";
import { defects, missing, progress, suggestedOverall, totals } from "@/lib/inspection";
import { todayISO } from "@/lib/dates";
import { photoUrl } from "@/lib/client-urls";
import { AppBar } from "@/components/AppBar";
import { ChevronLeft, ChevronRight, WarnIcon } from "@/components/icons";
import { ReviewForm } from "./ReviewForm";
import { QueueNotice } from "@/components/QueueNotice";

export const metadata = { title: "Review and sign" };

async function signOff(_prev: { error: string } | null, formData: FormData): Promise<{ error: string } | null> {
  "use server";
  const user = await requirePageUser(["driver", "manager", "mechanic"]);
  const id = String(formData.get("id"));
  try {
    await certify(user, id, {
      overall: String(formData.get("overall") ?? ""),
      comments: String(formData.get("comments") ?? ""),
      signature: String(formData.get("signature") ?? ""),
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/inspect/${id}/done?new=1`);
}

export default async function Review({ params }: PageProps<"/inspect/[id]/review">) {
  const user = await requirePageUser(["driver", "manager", "mechanic"]);
  const { id } = await params;
  const view = await ownDraftView(user, id);
  const today = todayISO();
  const left = missing(view.insp, today);
  const fails = defects(view.insp, today);
  const t = totals(progress(view.insp, today));

  return (
    <main className="phone">
      <AppBar user={user} />
      <div className="body-pad">
        <Link href={`/inspect/${id}`} className="btn btn-quiet" style={{ alignSelf: "flex-start" }}>
          <ChevronLeft /> Sections
        </Link>
        <div>
          <h1 className="heading" style={{ fontSize: 28 }}>Review and sign</h1>
          <p className="lead">{unitLine(view)}</p>
        </div>

        <QueueNotice inspectionId={id} />

        <div className="tiles">
          <div className="tile">
            <span className="tile-label">Items done</span>
            <span className="tile-num">
              {t.done}/{t.total}
            </span>
          </div>
          <div className={`tile ${fails.length ? "tile-warn" : ""}`}>
            <span className="tile-label">Failed items</span>
            <span className="tile-num">{fails.length}</span>
          </div>
        </div>

        {left.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="note-warn">
              <strong>{left.length} item{left.length === 1 ? "" : "s"} still to do</strong> before you can sign.
            </div>
            <div className="rows">
              {left.slice(0, 40).map((m) => (
                <Link key={m.item.id} href={`/inspect/${id}/${m.section.id}#item-${m.item.id}`} className="row-link">
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 15 }}>{m.item.label}</span>
                    <span className="row-sub">
                      {m.section.short} · {m.problem}
                    </span>
                  </span>
                  <ChevronRight />
                </Link>
              ))}
            </div>
          </section>
        )}

        {fails.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 className="section-label">Defects found</h2>
            <div className="rows">
              {fails.map((d) => (
                <Link key={d.item.id} href={`/inspect/${id}/${d.section.id}#item-${d.item.id}`} className="row-link" style={{ alignItems: "flex-start" }}>
                  <WarnIcon size={18} color="var(--orange-dark)" />
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 15 }}>{d.item.label}</span>
                    <span className="row-sub">{d.result.note || "No note yet"}</span>
                  </span>
                  {d.result.photos[0] && <img src={photoUrl(d.result.photos[0].key)} alt="" style={{ width: 64, height: 48, objectFit: "cover" }} />}
                </Link>
              ))}
            </div>
          </section>
        )}

        <ReviewForm
          action={signOff}
          id={id}
          ready={left.length === 0}
          hasDefects={fails.length > 0}
          suggested={suggestedOverall(view.insp, today)}
          comments={view.insp.comments}
          name={user.name}
        />
      </div>
    </main>
  );
}
