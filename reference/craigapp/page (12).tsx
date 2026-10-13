import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/session";
import { canSeeAllLoads, listLoadsFor } from "@/server/loads";
import { getStore } from "@/server/store";
import { displayDateLong } from "@/lib/format";
import { isValidISODate, rangeFor, todayISO } from "@/lib/dates";
import { sumHours } from "@/lib/format";
import SheetTable from "@/components/SheetTable";
import { DownloadIcon, EyeIcon } from "@/components/icons";
import styles from "./sheet.module.css";

export const metadata = { title: "Weekly log sheet" };

/** A driver's week laid out like the paper form (design/DriverLog.dc.html). */
export default async function SheetPage({ searchParams }: PageProps<"/sheet">) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const week = rangeFor("week", typeof sp.week === "string" && isValidISODate(sp.week) ? sp.week : todayISO());

  // Drivers only get their own sheet; dispatch and viewers can open anyone's.
  let driverId = user.id;
  if (canSeeAllLoads(user)) {
    if (typeof sp.driver !== "string") notFound();
    driverId = sp.driver;
  }
  const driver = await getStore().getUser(driverId);
  if (!driver || driver.role !== "driver") notFound();

  const loads = await listLoadsFor(user, { driverId, from: week.from, to: week.to });
  const rejects = loads.filter((l) => l.fields.reject === "Y").length;
  const pdfHref = `/api/sheet-pdf?driver=${driverId}&week=${week.from}`;
  const back = user.role === "driver" ? { href: `/my-log?week=${week.from}`, label: "Back to phone view" } : { href: "/dispatch?range=week&date=" + week.from + "&driver=" + driverId, label: "Back to dispatch" };

  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <div className={styles.identity}>
          <img src="/indeca-logo.png" alt="Indeca Crude Xpress" className={styles.logo} />
          <div>
            <div className={styles.line}>
              <div className={styles.lineLabel}>Employee Name</div>
              <div className={styles.lineValue}>{driver.name}</div>
            </div>
            <div className={styles.line}>
              <div className={styles.lineLabel}>Week</div>
              <div className={styles.lineValue}>
                {displayDateLong(week.from)} – {displayDateLong(week.to)}
              </div>
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          {user.role !== "dispatch" && (
            <span className="chip" style={{ padding: "8px 12px" }}>
              <EyeIcon size={14} /> View only
            </span>
          )}
          <a href={pdfHref} className="btn btn-outline" style={{ fontSize: 14 }} download>
            <DownloadIcon /> Download PDF
          </a>
          <Link href={back.href} className="btn btn-primary" style={{ fontSize: 14 }}>
            {back.label}
          </Link>
        </div>
      </div>

      <div className={styles.scroller}>
        <SheetTable loads={loads} fill={Math.max(10, loads.length)} />
      </div>

      <div className={styles.totals}>
        <div>Loads this week: <strong className="mono">{loads.length}</strong></div>
        <div>Rejects: <strong className="mono">{rejects}</strong></div>
        <div>Wait time: <strong className="mono">{sumHours(loads.map((l) => l.fields.waitTime))} hrs</strong></div>
      </div>
    </main>
  );
}
