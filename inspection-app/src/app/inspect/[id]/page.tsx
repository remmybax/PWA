import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/session";
import { ownDraftView, unitLine } from "@/server/view";
import { discardDraft } from "@/server/inspections";
import { progress, totals } from "@/lib/inspection";
import { todayISO, usDateTime } from "@/lib/dates";
import { AppBar } from "@/components/AppBar";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ArrowRight, CheckIcon, ChevronLeft, ChevronRight } from "@/components/icons";

export const metadata = { title: "Inspection" };

async function discard(formData: FormData) {
  "use server";
  const user = await requirePageUser(["driver", "manager", "mechanic"]);
  await discardDraft(user, String(formData.get("id")));
  redirect("/");
}

export default async function InspectionOverview({ params }: PageProps<"/inspect/[id]">) {
  const user = await requirePageUser(["driver", "manager", "mechanic"]);
  const { id } = await params;
  const view = await ownDraftView(user, id);
  const today = todayISO();
  const p = progress(view.insp, today);
  const t = totals(p);
  const next = p.find((s) => s.done < s.total) ?? null;

  return (
    <main className="phone">
      <AppBar user={user} />
      <div className="body-pad">
        <Link href="/" className="btn btn-quiet" style={{ alignSelf: "flex-start" }}>
          <ChevronLeft /> Home
        </Link>
        <div>
          <h1 className="heading" style={{ fontSize: 28 }}>{unitLine(view)}</h1>
          <p className="lead">
            Started {usDateTime(view.insp.startedAt)}
            {view.insp.location ? ` · ${view.insp.location}` : ""}
          </p>
        </div>

        <div className="box box-pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
            <span>{t.done === t.total ? "Every item answered" : "Progress"}</span>
            <span className="mono">
              {t.done} / {t.total}
            </span>
          </div>
          <div className="bar">
            <span style={{ width: `${(t.done / t.total) * 100}%` }} />
          </div>
          {t.fails > 0 && (
            <span className="badge badge-warn" style={{ alignSelf: "flex-start" }}>
              {t.fails} failed item{t.fails === 1 ? "" : "s"} so far
            </span>
          )}
        </div>

        <div className="rows">
          {p.map((s, i) => (
            <Link key={s.section.id} href={`/inspect/${id}/${s.section.id}`} className="row-link">
              <span className="mono" style={{ width: 22, color: "var(--muted)" }}>{i + 1}</span>
              <span className="row-main">
                <span className="row-title">{s.section.title}</span>
                <span className="row-sub">
                  {s.done} of {s.total} done
                  {s.fails ? ` · ${s.fails} failed` : ""}
                </span>
              </span>
              {s.done === s.total ? (
                <span className="badge badge-ok">
                  <CheckIcon size={14} /> Done
                </span>
              ) : s.done > 0 ? (
                <span className="badge badge-warn">In progress</span>
              ) : null}
              <ChevronRight />
            </Link>
          ))}
        </div>

        {next ? (
          <Link href={`/inspect/${id}/${next.section.id}`} className="btn btn-primary btn-big">
            {t.done ? "Continue" : "Start"}: {next.section.short} <ArrowRight />
          </Link>
        ) : null}
        <Link href={`/inspect/${id}/review`} className={`btn btn-big ${next ? "btn-outline" : "btn-orange"}`}>
          Review and sign <ArrowRight />
        </Link>

        <form action={discard} style={{ marginTop: 24 }}>
          <input type="hidden" name="id" value={id} />
          <ConfirmButton className="btn btn-quiet" style={{ width: "100%" }} message="Throw away this inspection and its photos? This can't be undone.">
            Discard this inspection
          </ConfirmButton>
        </form>
      </div>
    </main>
  );
}
