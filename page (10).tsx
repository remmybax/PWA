import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUser, signOut } from "@/server/session";
import { getLoadFor, listLoadsFor } from "@/server/loads";
import { isValidISODate, rangeFor, rangeLabel, shiftRange, todayISO } from "@/lib/dates";
import { sumHours } from "@/lib/format";
import SheetTable from "@/components/SheetTable";
import { CameraIcon, ChevronLeft, ChevronRight, EyeIcon } from "@/components/icons";
import styles from "./mylog.module.css";

export const metadata = { title: "My log" };

async function doSignOut() {
  "use server";
  await signOut();
  redirect("/signin");
}

export default async function MyLogPage({ searchParams }: PageProps<"/my-log">) {
  const user = await requirePageUser(["driver"]);
  const sp = await searchParams;
  const newId = typeof sp.new === "string" ? sp.new : undefined;

  let anchor = typeof sp.week === "string" && isValidISODate(sp.week) ? sp.week : todayISO();
  if (newId && typeof sp.week !== "string") {
    // Show the week of the load just logged (a ticket dated last Saturday lands on last week's sheet).
    const justLogged = await getLoadFor(user, newId).catch(() => null);
    if (justLogged) anchor = justLogged.fields.date;
  }
  const week = rangeFor("week", anchor);
  const loads = await listLoadsFor(user, { from: week.from, to: week.to });
  const prev = shiftRange(week, -1);
  const next = shiftRange(week, 1);
  const isCurrent = week.to >= todayISO();

  return (
    <main className="phone" style={{ height: "100dvh" }}>
      <header className="appbar">
        <img src="/indeca-logo.png" alt="Indeca Crude Xpress" />
        <span className="chip">
          <EyeIcon size={14} /> View only
        </span>
      </header>

      <div className={styles.top}>
        <div className={styles.titleRow}>
          <h1 className="heading" style={{ fontSize: 28 }}>My log</h1>
          <form action={doSignOut}>
            <button className={styles.signOut}>Sign out</button>
          </form>
        </div>
        <div className={styles.headerLines}>
          <div className={styles.line}>
            <div className={styles.lineLabel}>Employee Name</div>
            <div className={styles.lineValue}>{user.name}</div>
          </div>
          <div className={styles.line} style={{ padding: "2px 0" }}>
            <div className={styles.lineLabel}>Week</div>
            <Link href={`/my-log?week=${prev}`} aria-label="Previous week" className={styles.weekNav}>
              <ChevronLeft />
            </Link>
            <div className={styles.lineValue}>{rangeLabel(week)}</div>
            {isCurrent ? (
              <span className={styles.weekNav} aria-hidden="true" />
            ) : (
              <Link href={`/my-log?week=${next}`} aria-label="Next week" className={styles.weekNav}>
                <ChevronRight />
              </Link>
            )}
          </div>
        </div>
        <div className={styles.totals}>
          <div>
            <div className={styles.totalLabel}>Loads this week</div>
            <div className={styles.totalValue}>{loads.length}</div>
          </div>
          <div>
            <div className={styles.totalLabel}>Wait time (hrs)</div>
            <div className={styles.totalValue}>{sumHours(loads.map((l) => l.fields.waitTime))}</div>
          </div>
        </div>
      </div>

      <div className={styles.sheetArea}>
        <div className={styles.swipe}>Swipe the sheet for more columns →</div>
        <div className={styles.scroller}>
          <SheetTable loads={loads} highlightId={newId} />
        </div>
        <div className={styles.note}>
          {newId ? "Highlighted row = just logged. " : ""}Spot a mistake? Call dispatch. Only dispatch can edit a logged load.
        </div>
      </div>

      <div className={styles.actions}>
        <Link href={`/sheet?week=${week.from}`} className="btn btn-outline" style={{ height: 52 }}>
          Full sheet
        </Link>
        <Link href="/" className="btn btn-primary" style={{ height: 52 }}>
          <CameraIcon /> Scan next
        </Link>
      </div>
    </main>
  );
}
