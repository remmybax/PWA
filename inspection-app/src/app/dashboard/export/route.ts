import { ALL_ITEMS } from "@/lib/checklist";
import { isoInZone, usDate } from "@/lib/dates";
import { answerText, defects, judgeDay } from "@/lib/inspection";
import { OVERALL_LABEL } from "@/lib/types";
import { getCurrentUser } from "@/server/session";
import { getStore } from "@/server/store";

function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Every signed inspection as a spreadsheet: one row per inspection, one column per checklist item.
 * ?defects=1 gives one row per failed item instead.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role === "driver") return new Response("Not found", { status: 404 });
  const store = getStore();
  const [list, vehicles] = await Promise.all([store.listInspections({ certified: true }), store.listVehicles()]);
  const unitOf = (id: string | null) => vehicles.find((v) => v.id === id)?.unit ?? "";
  const today = isoInZone(new Date());
  const onlyDefects = new URL(request.url).searchParams.get("defects") === "1";

  let rows: string[][];
  if (onlyDefects) {
    rows = [["Date", "Truck", "Trailer", "Inspector", "Item", "Answer", "Note", "Repaired", "Repaired by", "Repair note"]];
    for (const i of list) {
      for (const d of defects(i, judgeDay(i, today))) {
        rows.push([
          usDate(isoInZone(new Date(i.certifiedAt!))),
          unitOf(i.truckId),
          unitOf(i.trailerId),
          i.inspectorName,
          d.item.label,
          answerText(d.item, d.result, judgeDay(i, today)),
          d.result.note ?? "",
          d.result.resolution ? usDate(isoInZone(new Date(d.result.resolution.at))) : "",
          d.result.resolution?.byName ?? "",
          d.result.resolution?.note ?? "",
        ]);
      }
    }
  } else {
    rows = [["Date", "Truck", "Trailer", "Inspector", "Location", "Status", "Defects", "Open defects", "Comments", ...ALL_ITEMS.map((i) => i.label)]];
    for (const i of list) {
      const day = judgeDay(i, today);
      const fails = defects(i, day);
      rows.push([
        usDate(isoInZone(new Date(i.certifiedAt!))),
        unitOf(i.truckId),
        unitOf(i.trailerId),
        i.inspectorName,
        i.location,
        i.overall ? OVERALL_LABEL[i.overall] : "",
        String(fails.length),
        String(fails.filter((d) => !d.resolved).length),
        i.comments,
        ...ALL_ITEMS.map((item) => (i.results[item.id] ? answerText(item, i.results[item.id], day) + (i.results[item.id].note ? ` (${i.results[item.id].note})` : "") : "")),
      ]);
    }
  }
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inspections${onlyDefects ? "-defects" : ""}-${today}.csv"`,
    },
  });
}
