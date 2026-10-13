import { NextResponse } from "next/server";
import { apiError, apiUser } from "@/server/api";
import { canSeeAllLoads, listLoadsFor } from "@/server/loads";
import { getStore } from "@/server/store";
import { buildSheetPdf } from "@/server/export";
import { isValidISODate, rangeFor, todayISO } from "@/lib/dates";

/** The driver's weekly sheet as a PDF laid out like the paper form. */
export async function GET(req: Request) {
  try {
    const user = await apiUser();
    const url = new URL(req.url);
    const weekParam = url.searchParams.get("week");
    const week = rangeFor("week", isValidISODate(weekParam) ? weekParam : todayISO());
    const driverId = canSeeAllLoads(user) ? url.searchParams.get("driver") ?? "" : user.id;

    const driver = await getStore().getUser(driverId);
    if (!driver || driver.role !== "driver") return NextResponse.json({ error: "Not found" }, { status: 404 });

    const loads = await listLoadsFor(user, { driverId, from: week.from, to: week.to });
    const pdf = await buildSheetPdf(driver, week, loads);
    const name = `log-sheet-${driver.name.replace(/[^A-Za-z0-9]+/g, "-")}-${week.from}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
