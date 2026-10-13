// Payroll export (CSV / Excel) and the weekly sheet PDF.
// What Blaze actually needs is still an open question for Craig, so both formats carry every
// sheet column plus driver and status; trim once he answers.

import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DRIVER_COLUMN_WIDTH, FIELDS } from "@/lib/fields";
import { displayDateLong, displayValue, sumHours } from "@/lib/format";
import { isoInZone, timeInZone } from "@/lib/dates";
import { csvCell } from "@/lib/csv";
import { summaryStatus, type Load, type User } from "@/lib/types";

const STATUS_LABEL = { ok: "Read OK", typed: "Typed by driver", confirmed: "Driver confirmed", edited: "Edited by dispatch" } as const;

/** Export columns: Driver, the 18 sheet fields, then status and when it was logged. */
function exportRows(loads: Load[], users: Map<string, User>) {
  const header = ["Driver", ...FIELDS.map((f) => f.sheetLabel.replace("\n", " ")), "Status", "Logged at"];
  const rows = loads.map((l) => [
    users.get(l.driverId)?.name ?? l.driverId,
    ...FIELDS.map((f) => (f.key === "date" ? displayDateLong(l.fields.date) : l.fields[f.key])),
    STATUS_LABEL[summaryStatus(l)],
    `${displayDateLong(isoInZone(new Date(l.loggedAt)))} ${timeInZone(new Date(l.loggedAt))}`,
  ]);
  return { header, rows };
}

export function buildCsv(loads: Load[], users: Map<string, User>): string {
  const { header, rows } = exportRows(loads, users);
  // BOM so Excel opens it as UTF-8 (em dashes, degree signs in comments).
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function buildXlsx(loads: Load[], users: Map<string, User>, title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Indeca Ticket Log";
  wb.created = new Date();

  const { header, rows } = exportRows(loads, users);
  const ws = wb.addWorksheet("Loads", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(header);
  // Everything goes in as text: gauges, seals with leading zeros and tickets must not be reformatted
  // by Excel. Wait time is the one column worth summing, so it's a number.
  const waitCol = header.indexOf("Wait Time") + 1;
  for (const r of rows) {
    const row = ws.addRow(r);
    const w = row.getCell(waitCol);
    w.value = Number(w.value) || 0;
    w.numFmt = "0.00";
  }
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D085C" } };
  head.alignment = { wrapText: true, vertical: "bottom" };
  ws.columns.forEach((c, i) => {
    c.width = i === 0 ? 18 : header[i] === "Comments" ? 36 : header[i] === "Logged at" ? 17 : 11;
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };

  const sum = wb.addWorksheet("By driver");
  sum.addRow([title]).font = { bold: true, size: 13 };
  sum.addRow([]);
  const sh = sum.addRow(["Driver", "Loads", "Rejects", "Wait time (hrs)", "Driver-confirmed", "Edited by dispatch"]);
  sh.font = { bold: true };
  const byDriver = new Map<string, Load[]>();
  for (const l of loads) byDriver.set(l.driverId, [...(byDriver.get(l.driverId) ?? []), l]);
  for (const [driverId, ls] of [...byDriver].sort((a, b) => (users.get(a[0])?.name ?? "").localeCompare(users.get(b[0])?.name ?? ""))) {
    const r = sum.addRow([
      users.get(driverId)?.name ?? driverId,
      ls.length,
      ls.filter((l) => l.fields.reject === "Y").length,
      Number(sumHours(ls.map((l) => l.fields.waitTime))),
      ls.filter((l) => summaryStatus(l) === "confirmed").length,
      ls.filter((l) => summaryStatus(l) === "edited").length,
    ]);
    r.getCell(4).numFmt = "0.00";
  }
  const t = sum.addRow(["Total", loads.length, loads.filter((l) => l.fields.reject === "Y").length, Number(sumHours(loads.map((l) => l.fields.waitTime)))]);
  t.font = { bold: true };
  t.getCell(4).numFmt = "0.00";
  sum.columns.forEach((c, i) => (c.width = i === 0 ? 22 : 16));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Weekly sheet PDF (matches docs/current-paper-log-sheet.png) ----------

const INK = rgb(22 / 255, 28 / 255, 42 / 255);
const MUTED = rgb(86 / 255, 91 / 255, 102 / 255);
const ROWS_PER_PAGE = 26;

function fitText(text: string, font: PDFFont, size: number, max: number): string {
  if (font.widthOfTextAtSize(text, size) <= max) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > max) t = t.slice(0, -1);
  return t + "…";
}

/** pdf-lib's standard fonts only cover WinAnsi; swap anything else rather than crash. */
function winAnsi(text: string): string {
  return text.replace(/[^\x20-\x7E -ÿ–—‘’“”…]/g, "?");
}

interface LogPdfOptions {
  title: string;
  /** Lines under the logo, like the paper sheet's "Employee Name" and "Week". */
  headerLines: [string, string][];
  loads: Load[];
  /** When set, a Driver column comes first (fleet exports). */
  driverName?: (load: Load) => string;
  /** "Loads this week: 10" etc. */
  totalsLabel: string;
}

/** The paper log sheet as a PDF: the 18 columns, plus Driver for fleet exports. */
export async function buildLogPdf(o: LogPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(o.title);
  pdf.setAuthor("Indeca Crude Xpress");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await fs.readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "indeca-logo.png"));
  const logo = await pdf.embedPng(logoBytes);

  type Col = { label: string; width: number; value: (l: Load) => string; left?: boolean };
  const cols: Col[] = [
    ...(o.driverName ? [{ label: "Driver", width: DRIVER_COLUMN_WIDTH, value: o.driverName, left: true }] : []),
    ...FIELDS.map((f) => ({
      label: f.sheetLabel,
      width: f.width,
      value: (l: Load) => (f.key === "comments" ? l.fields.comments : displayValue(f.key, l.fields[f.key])),
      left: f.key === "comments",
    })),
  ];

  const W = 792; // US Letter, landscape
  const H = 612;
  const margin = 28;
  const tableW = W - margin * 2;
  const total = cols.reduce((a, c) => a + c.width, 0);
  const widths = cols.map((c) => (c.width / total) * tableW);
  const headH = 30;
  const rowH = 16;
  const size = o.driverName ? 7 : 7.5;

  const pages = Math.max(1, Math.ceil(o.loads.length / ROWS_PER_PAGE));
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage([W, H]);
    const slice = o.loads.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    drawHeader(page, { logo, regular, bold, lines: o.headerLines, margin, H, pageLabel: pages > 1 ? `Page ${p + 1} of ${pages}` : "" });

    let y = H - 120;
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.7, color: INK });

    // Header cells
    let x = margin;
    cols.forEach((c, i) => {
      const parts = c.label.split("\n");
      parts.forEach((part, j) => {
        const hs = 6.8;
        const tw = regular.widthOfTextAtSize(part, hs);
        page.drawText(part, { x: x + (widths[i] - tw) / 2, y: y - headH + 5 + (parts.length - 1 - j) * 8, size: hs, font: regular, color: INK });
      });
      x += widths[i];
    });
    line(margin, y, margin + tableW, y);
    y -= headH;
    line(margin, y, margin + tableW, y);

    // Rows (blank rows pad the page like the paper form)
    for (let r = 0; r < ROWS_PER_PAGE; r++) {
      const load = slice[r];
      if (load) {
        x = margin;
        cols.forEach((c, i) => {
          const raw = winAnsi(c.value(load));
          // Any value too long for its column shrinks to fit before anything is cut off.
          const fullW = regular.widthOfTextAtSize(raw, size);
          const cs = Math.max(5, Math.min(size, (size * (widths[i] - 4)) / Math.max(fullW, 1)));
          const text = fitText(raw, regular, cs, widths[i] - 4);
          const tw = regular.widthOfTextAtSize(text, cs);
          page.drawText(text, { x: c.left ? x + 3 : x + (widths[i] - tw) / 2, y: y - rowH + 4.5, size: cs, font: regular, color: INK });
          x += widths[i];
        });
      }
      y -= rowH;
      line(margin, y, margin + tableW, y);
    }
    // Vertical lines
    const top = H - 120;
    x = margin;
    line(x, top, x, y);
    for (const w of widths) {
      x += w;
      line(x, top, x, y);
    }

    if (p === pages - 1) {
      page.drawText(o.totalsLabel, { x: margin, y: y - 16, size: 9, font: regular, color: INK });
    }
    const stamp = `Generated ${displayDateLong(isoInZone(new Date()))} ${timeInZone(new Date())} from the Indeca Ticket Log`;
    page.drawText(stamp, { x: W - margin - regular.widthOfTextAtSize(stamp, 7), y: 14, size: 7, font: regular, color: MUTED });
  }
  return pdf.save();
}

export function totalsLabel(loads: Load[], period = ""): string {
  const rejects = loads.filter((l) => l.fields.reject === "Y").length;
  return `Loads${period ? ` ${period}` : ""}: ${loads.length}     Rejects: ${rejects}     Wait time: ${sumHours(loads.map((l) => l.fields.waitTime))} hrs`;
}

/** One driver's week, exactly like the paper sheet. */
export function buildSheetPdf(driver: User, week: { from: string; to: string }, loads: Load[]): Promise<Uint8Array> {
  return buildLogPdf({
    title: `Log sheet ${driver.name} ${displayDateLong(week.from)}`,
    headerLines: [
      ["Employee Name", driver.name],
      ["Week", `${displayDateLong(week.from)} – ${displayDateLong(week.to)}`],
    ],
    loads,
    totalsLabel: totalsLabel(loads, "this week"),
  });
}

function drawHeader(
  page: PDFPage,
  o: {
    logo: Awaited<ReturnType<PDFDocument["embedPng"]>>;
    regular: PDFFont;
    bold: PDFFont;
    lines: [string, string][];
    margin: number;
    H: number;
    pageLabel: string;
  },
) {
  const { margin, H } = o;
  const logoW = 150;
  const logoH = (o.logo.height / o.logo.width) * logoW;
  page.drawImage(o.logo, { x: margin, y: H - margin - logoH, width: logoW, height: logoH });
  let y = H - margin - logoH - 14;
  for (const [label, value] of o.lines) {
    page.drawText(label, { x: margin, y, size: 9, font: o.regular, color: MUTED });
    page.drawText(winAnsi(value), { x: margin + 90, y, size: 9.5, font: o.bold, color: INK });
    page.drawLine({ start: { x: margin, y: y - 3 }, end: { x: margin + 340, y: y - 3 }, thickness: 0.7, color: INK });
    y -= 15;
  }
  if (o.pageLabel) {
    page.drawText(o.pageLabel, { x: 792 - margin - o.regular.widthOfTextAtSize(o.pageLabel, 8), y: H - margin - 10, size: 8, font: o.regular, color: MUTED });
  }
}
