import { NextResponse } from "next/server";
import { apiError, apiUser } from "@/server/api";
import { canSeeAllLoads, ForbiddenError, listLoadsFor } from "@/server/loads";
import { getStore } from "@/server/store";
import { buildCsv, buildLogPdf, buildXlsx, totalsLabel } from "@/server/export";
import { rangeFromParams, rangeLabel, todayISO } from "@/lib/dates";
import { displayDateLong, shortName } from "@/lib/format";

/**
 * Dispatch exports: every load in the selected range (day / week / month / from–to / all time),
 * for one driver or the whole fleet, as Excel, CSV, PDF, or JSON (which the dashboard turns into
 * a JPG image of the sheet).
 */
export async function GET(req: Request) {
  try {
    const user = await apiUser();
    if (!canSeeAllLoads(user)) throw new ForbiddenError("Only dispatch can export");

    const url = new URL(req.url);
    const range = rangeFromParams((k) => url.searchParams.get(k), todayISO());
    const driverId = url.searchParams.get("driver") || undefined;
    const format = url.searchParams.get("format") ?? "xlsx";

    const loads = await listLoadsFor(user, { driverId, from: range.from || undefined, to: range.to || undefined });
    const users = new Map((await getStore().listUsers()).map((u) => [u.id, u]));
    const driverName = driverId ? users.get(driverId)?.name ?? driverId : "";
    const period = range.mode === "all" ? "all-time" : `${range.from}${range.to !== range.from ? `-to-${range.to}` : ""}`;
    const base = `loads-${period}${driverId ? `-${driverName.replace(/[^A-Za-z0-9]+/g, "-")}` : ""}`;
    const title = `${driverName || "All drivers"} · ${rangeLabel(range)}`;
    const download = (body: BodyInit, type: string, ext: string) =>
      new NextResponse(body, {
        headers: {
          "Content-Type": type,
          "Content-Disposition": `attachment; filename="${base}.${ext}"`,
          "Cache-Control": "private, no-store",
        },
      });

    if (format === "csv") return download(buildCsv(loads, users), "text/csv; charset=utf-8", "csv");

    if (format === "pdf" || format === "json") {
      const periodText =
        range.mode === "all" ? "All time" : range.from === range.to ? displayDateLong(range.from) : `${displayDateLong(range.from)} – ${displayDateLong(range.to)}`;
      const headerLines: [string, string][] = [
        ["Employee Name", driverName || "All drivers"],
        [range.mode === "week" ? "Week" : "Dates", periodText],
      ];
      const nameOf = (driver: string) => shortName(users.get(driver)?.name ?? "?");

      if (format === "json") {
        // Everything the dashboard needs to draw the JPG version of the sheet.
        return NextResponse.json({
          fileName: `${base}.jpg`,
          headerLines,
          showDriver: !driverId,
          totals: totalsLabel(loads),
          rows: loads.map((l) => ({ driver: nameOf(l.driverId), fields: l.fields })),
        });
      }
      const pdf = await buildLogPdf({
        title,
        headerLines,
        loads,
        driverName: driverId ? undefined : (l) => nameOf(l.driverId),
        totalsLabel: totalsLabel(loads),
      });
      return download(new Uint8Array(pdf), "application/pdf", "pdf");
    }

    const xlsx = await buildXlsx(loads, users, `Loads ${title}`);
    return download(new Uint8Array(xlsx), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx");
  } catch (e) {
    return apiError(e);
  }
}
