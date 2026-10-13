import Link from "next/link";
import { requirePageUser } from "@/server/session";
import { getStore } from "@/server/store";
import { AppBar } from "@/components/AppBar";
import { ArrowRight, ChevronRight, TicketIcon, TruckIcon } from "@/components/icons";
import { usDate, isoInZone, todayISO } from "@/lib/dates";
import { progress, totals } from "@/lib/inspection";
import { OVERALL_LABEL } from "@/lib/types";
import { OverallBadge } from "@/components/badges";
import styles from "./home.module.css";

export const metadata = { title: "Home" };

/**
 * The driver's start screen: pick Ticket upload or Truck inspection. Ticket upload opens the
 * Ticket Log app (TICKET_LOG_URL), which stays a separate app; this is where the two meet.
 */
export default async function Home() {
  const user = await requirePageUser(["driver", "manager", "mechanic"]);
  const store = getStore();
  const [mine, vehicles] = await Promise.all([store.listInspections({ inspectorId: user.id }), store.listVehicles()]);
  const unit = (id: string | null) => vehicles.find((v) => v.id === id)?.unit ?? "?";
  const drafts = mine.filter((i) => !i.certifiedAt);
  const done = mine.filter((i) => i.certifiedAt).slice(0, 8);
  const ticketUrl = process.env.TICKET_LOG_URL;
  const today = todayISO();

  return (
    <main className="phone">
      <AppBar user={user} />
      <div className="body-pad">
        <h1 className="heading" style={{ fontSize: 28 }}>What are you doing?</h1>

        <div className={styles.modes}>
          {ticketUrl ? (
            <a href={ticketUrl} className={styles.mode}>
              <TicketIcon size={32} />
              <span className={styles.modeText}>
                <span className={styles.modeTitle}>Ticket upload</span>
                <span className={styles.modeSub}>Photograph a run ticket for your load log</span>
              </span>
              <ChevronRight />
            </a>
          ) : (
            <div className={`${styles.mode} ${styles.modeOff}`}>
              <TicketIcon size={32} />
              <span className={styles.modeText}>
                <span className={styles.modeTitle}>Ticket upload</span>
                <span className={styles.modeSub}>Opens the Ticket Log app once its address is set (TICKET_LOG_URL)</span>
              </span>
            </div>
          )}
          <Link href="/inspect/new" className={`${styles.mode} ${styles.modeMain}`}>
            <TruckIcon size={32} />
            <span className={styles.modeText}>
              <span className={styles.modeTitle}>Truck inspection</span>
              <span className={styles.modeSub}>Monthly inspection with photos</span>
            </span>
            <ArrowRight />
          </Link>
        </div>

        {drafts.length > 0 && (
          <section className={styles.section}>
            <h2 className="section-label">In progress</h2>
            <div className="rows">
              {drafts.map((d) => {
                const t = totals(progress(d, today));
                return (
                  <Link key={d.id} href={`/inspect/${d.id}`} className="row-link">
                    <span className="row-main">
                      <span className="row-title">
                        Truck {unit(d.truckId)}
                        {d.trailerId ? ` · Trailer ${unit(d.trailerId)}` : ""}
                      </span>
                      <span className="row-sub">
                        Started {usDate(isoInZone(new Date(d.startedAt)))} · {t.done} of {t.total} done
                      </span>
                    </span>
                    <span className="badge badge-warn">Continue</span>
                    <ChevronRight />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <h2 className="section-label">My inspections</h2>
          {done.length ? (
            <div className="rows">
              {done.map((d) => (
                <Link key={d.id} href={`/inspect/${d.id}/done`} className="row-link">
                  <span className="row-main">
                    <span className="row-title">
                      Truck {unit(d.truckId)}
                      {d.trailerId ? ` · Trailer ${unit(d.trailerId)}` : ""}
                    </span>
                    <span className="row-sub">{usDate(isoInZone(new Date(d.certifiedAt!)))} · {OVERALL_LABEL[d.overall!]}</span>
                  </span>
                  <OverallBadge overall={d.overall} />
                  <ChevronRight />
                </Link>
              ))}
            </div>
          ) : (
            <p className="lead">None yet. Inspections you sign off show up here, with their QR label and report.</p>
          )}
        </section>

        {user.role !== "driver" && (
          <Link href="/dashboard" className="btn btn-outline">
            Fleet dashboard <ArrowRight />
          </Link>
        )}
      </div>
    </main>
  );
}
