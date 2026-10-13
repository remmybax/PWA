import { requirePageUser } from "@/server/session";
import { listLoadsFor } from "@/server/loads";
import { dayLabel, isoInZone, todayISO } from "@/lib/dates";
import ScanFlow from "./scan/ScanFlow";

export const metadata = { title: "Scan ticket" };

export default async function DriverHome() {
  const user = await requirePageUser(["driver"]);
  const today = todayISO();
  const mine = await listLoadsFor(user);
  const loggedToday = mine.filter((l) => isoInZone(new Date(l.loggedAt)) === today).length;
  const latest = [...mine].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0];

  return (
    <ScanFlow
      loadNumber={loggedToday + 1}
      todayLabel={dayLabel(today)}
      loggedToday={loggedToday}
      lastStation={latest?.fields.station ?? ""}
      todayISO={today}
    />
  );
}
