import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUser, signOut } from "@/server/session";
import { canEditLoads, listLoadsFor } from "@/server/loads";
import { getStore } from "@/server/store";
import { DRIVER_COLUMN_WIDTH, FIELDS } from "@/lib/fields";
import { displayValue, fitClass, sheetColumns, shortName, sumHours } from "@/lib/format";
import { isoInZone, rangeFor, rangeFromParams, rangeLabel, shiftRange, timeInZone, todayISO, type RangeMode } from "@/lib/dates";
import { summaryStatus, type Load } from "@/lib/types";
import { ChevronLeft, ChevronRight, DownloadIcon } from "@/components/icons";
import DriverSelect from "./DriverSelect";
import LoadPanel from "./LoadPanel";
import ImageExport from "./ImageExport";
import styles from "./dispatch.module.css";

export const metadata = { title: "Load log" };

const STATUS = {
  ok: { label: "Read OK", cls: "status status-ok" },
  typed: { label: "Typed by driver", cls: "status status-ok" },
  confirmed: { label: "Driver confirmed", cls: "status status-confirmed" },
  edited: { label: "Edited by dispatch", cls: "status status-edited" },
} as const;

async function doSignOut() {
  "use server";
  await signOut();
  redirect("/signin");
}

type Params = { range: RangeMode; date: string; from?: string; to?: string; driver?: string; sel?: string };

/** The range part of the URL: date for day/week/month, from+to for a custom range, nothing for all time. */
function rangeQuery(q: Params): URLSearchParams {
  const s = new URLSearchParams();
  s.set("range", q.range);
  if (q.range === "range") {
    s.set("from", q.from ?? q.date);
    s.set("to", q.to ?? q.date);
  } else if (q.range !== "all") s.set("date", q.date);
  if (q.driver) s.set("driver", q.driver);
  return s;
}

function href(p: Params, change: Partial<Params> = {}): string {
  const q = { ...p, ...change };
  const s = rangeQuery(q);
  if (q.sel) s.set("sel", q.sel);
  return `/dispatch?${s}`;
}

/** Driver, the 18 sheet columns, then Status. */
const TABLE_COLUMNS = `${DRIVER_COLUMN_WIDTH}px ${sheetColumns(FIELDS.map((f) => (f.key === "comments" ? { ...f, width: 120 } : f)))} 132px`;

const RANGE_TABS: { mode: RangeMode; label: string }[] = [
  { mode: "day", label: "Day" },
  { mode: "week", label: "Week" },
  { mode: "month", label: "Month" },
  { mode: "range", label: "From–To" },
  { mode: "all", label: "All time" },
];

export default async function DispatchPage({ searchParams }: PageProps<"/dispatch">) {
  const user = await requirePageUser(["dispatch", "viewer"]);
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const today = todayISO();
  const range = rangeFromParams(str, today);
  const mode = range.mode;
  // Day/week/month step from here; switching to From–To starts from the dates on screen.
  const date = range.from || today;
  const p: Params = {
    range: mode,
    date,
    from: range.from || undefined,
    to: range.to || undefined,
    driver: str("driver") || undefined,
    sel: str("sel"),
  };

  const store = getStore();
  const users = await store.listUsers();
  const userById = new Map(users.map((u) => [u.id, u]));
  const drivers = users.filter((u) => u.role === "driver").sort((a, b) => a.name.localeCompare(b.name));
  const loads = await listLoadsFor(user, { driverId: p.driver, from: range.from || undefined, to: range.to || undefined });

  const selected: Load | undefined =
    loads.find((l) => l.id === p.sel) ?? [...loads].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0];

  // Nothing in this range: offer the most recent day that has loads.
  let latestDate: string | undefined;
  if (!loads.length) {
    const all = await listLoadsFor(user, { driverId: p.driver });
    latestDate = all.map((l) => l.fields.date).sort().at(-1);
  }

  const confirmedFields = loads.reduce((t, l) => t + Object.values(l.status).filter((s) => s === "confirmed").length, 0);
  const exportQs = rangeQuery(p).toString();

  return (
    <div className={styles.page}>
      <header className={`appbar ${styles.bar}`}>
        <div className={styles.brand}>
          <img src="/indeca-logo.png" alt="Indeca Crude Xpress" style={{ height: 44 }} />
          <div className={styles.divider} />
          <div className={styles.titleGroup}>
            <h1 className="heading" style={{ fontSize: 26, letterSpacing: "0.03em" }}>Load log</h1>
            <div className={styles.subtitle}>Dispatch · all drivers</div>
          </div>
        </div>
        <div className={styles.who}>
          {user.role === "dispatch" && (
            <Link href="/dispatch/people" className={styles.whoLink}>People &amp; access</Link>
          )}
          <span className={styles.avatar}>{user.name[0]}</span>
          <span>
            {user.name} · {user.role === "dispatch" ? "full access" : "view and export"}
          </span>
          <form action={doSignOut}>
            <button className={styles.whoLink} style={{ border: 0, background: "none", cursor: "pointer" }}>Sign out</button>
          </form>
        </div>
      </header>

      <div className={styles.body}>
        <main className={styles.main}>
          <div className={styles.toolbar}>
            <div className={styles.filters}>
              <nav className={styles.segment} aria-label="Range">
                {RANGE_TABS.map(({ mode: m, label }) => (
                  <Link
                    key={m}
                    href={href(p, { range: m, sel: undefined, from: range.from || today, to: range.to || today })}
                    className={m === mode ? styles.segOn : styles.segOff}
                    aria-current={m === mode ? "page" : undefined}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              {mode === "range" ? (
                <form action="/dispatch" className={styles.dateRange}>
                  <input type="hidden" name="range" value="range" />
                  {p.driver && <input type="hidden" name="driver" value={p.driver} />}
                  <label>
                    From <input type="date" name="from" defaultValue={range.from} className="input" required />
                  </label>
                  <label>
                    To <input type="date" name="to" defaultValue={range.to} className="input" required />
                  </label>
                  <button className="btn btn-primary">Show</button>
                </form>
              ) : mode === "all" ? (
                <div className={styles.rangeLabel}>All time</div>
              ) : (
              <div className={styles.stepper}>
                <Link href={href(p, { date: shiftRange(range, -1), sel: undefined })} className={styles.stepBtn} aria-label="Previous">
                  <ChevronLeft />
                </Link>
                <div className={styles.rangeLabel}>{rangeLabel(range)}</div>
                <Link href={href(p, { date: shiftRange(range, 1), sel: undefined })} className={styles.stepBtn} aria-label="Next">
                  <ChevronRight />
                </Link>
                {date !== today && (
                  <Link href={href(p, { date: today, sel: undefined })} className={styles.todayLink}>Today</Link>
                )}
              </div>
              )}
              <DriverSelect drivers={drivers.map((d) => ({ id: d.id, name: shortName(d.name) }))} value={p.driver ?? ""} />
            </div>
            <div className={styles.exports} role="group" aria-label="Export to">
              <span className={styles.exportLabel}>
                <DownloadIcon /> Export to:
              </span>
              <a href={`/api/export?${exportQs}&format=csv`} className="btn btn-outline" download>CSV</a>
              <a href={`/api/export?${exportQs}`} className="btn btn-outline" download>Excel</a>
              <a href={`/api/export?${exportQs}&format=pdf`} className="btn btn-outline" download>PDF</a>
              <ImageExport query={exportQs} />
            </div>
          </div>

          <div className={styles.tiles}>
            <div className={styles.tile}>
              <div className={styles.tileLabel}>Loads logged</div>
              <div className={styles.tileValue}>{loads.length}</div>
            </div>
            <div className={styles.tile}>
              <div className={styles.tileLabel}>Drivers reporting</div>
              <div className={styles.tileValue}>{new Set(loads.map((l) => l.driverId)).size}</div>
            </div>
            <div className={styles.tile}>
              <div className={styles.tileLabel}>Wait time (hrs)</div>
              <div className={styles.tileValue}>{sumHours(loads.map((l) => l.fields.waitTime))}</div>
            </div>
            <div className={`${styles.tile} ${styles.tileFlag}`}>
              <div className={styles.tileLabel} style={{ color: "#6B2800" }}>Driver-confirmed fields to spot-check</div>
              <div className={styles.tileValue} style={{ color: "#8A3303" }}>{confirmedFields}</div>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <div className={styles.table} role="table" aria-label="Loads" style={{ "--cols": TABLE_COLUMNS } as React.CSSProperties}>
              <div className={styles.thead} role="row">
                <div role="columnheader" className={styles.left}>Driver</div>
                {FIELDS.map((f) => (
                  <div key={f.key} role="columnheader">{f.sheetLabel}</div>
                ))}
                <div role="columnheader" className={styles.left} style={{ borderRight: 0 }}>Status</div>
              </div>
              {loads.map((l) => {
                const st = STATUS[summaryStatus(l)];
                const driverName = shortName(userById.get(l.driverId)?.name ?? "?");
                const isSel = l.id === selected?.id;
                return (
                  <Link
                    key={l.id}
                    href={href(p, { sel: l.id })}
                    scroll={false}
                    role="row"
                    aria-current={isSel ? "true" : undefined}
                    className={`${styles.row} ${isSel ? styles.rowSel : ""}`}
                  >
                    <div role="cell" className={`${styles.driverCell} ${fitClass(driverName, DRIVER_COLUMN_WIDTH)}`}>{driverName}</div>
                    {FIELDS.map((f) => {
                      const text = displayValue(f.key, l.fields[f.key]);
                      return (
                        <div
                          key={f.key}
                          role="cell"
                          className={`${f.key === "comments" ? styles.commentCell : ""} ${fitClass(text, f.width)} ${l.status[f.key] === "confirmed" ? styles.cellConfirmed : ""} ${l.status[f.key] === "edited" ? styles.cellEdited : ""}`}
                          title={f.key === "comments" ? l.fields.comments : undefined}
                        >
                          {text}
                        </div>
                      );
                    })}
                    <div role="cell" className={styles.statusCell}>
                      <span className={st.cls}>{st.label}</span>
                    </div>
                  </Link>
                );
              })}
              {!loads.length && (
                <div className={styles.empty}>
                  No loads logged{" "}
                  {mode === "day" ? "on this day" : mode === "range" ? "between these dates" : mode === "all" ? "yet" : `this ${mode}`}
                  {p.driver ? " for this driver" : ""}.
                  {latestDate && (
                    <>
                      {" "}
                      <Link href={href(p, { range: "day", date: latestDate, sel: undefined })}>Go to the latest loads ({displayValue("date", latestDate)})</Link>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {p.driver && (
            <div className={styles.sheetLink}>
              <Link href={`/sheet?driver=${p.driver}&week=${rangeFor("week", date).from}`}>
                Open {userById.get(p.driver)?.name}&apos;s weekly sheet (PDF)
              </Link>
            </div>
          )}
        </main>

        <aside className={styles.panel}>
          {selected ? (
            <LoadPanel
              key={selected.id + selected.history.length}
              load={selected}
              driverName={userById.get(selected.driverId)?.name ?? "?"}
              loggedLabel={`${displayValue("date", isoInZone(new Date(selected.loggedAt)))} ${timeInZone(new Date(selected.loggedAt))}`}
              canEdit={canEditLoads(user)}
              sheetHref={`/sheet?driver=${selected.driverId}&week=${rangeFor("week", selected.fields.date).from}`}
            />
          ) : (
            <div className={styles.panelEmpty}>Select a load to see the ticket photo and every field.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
