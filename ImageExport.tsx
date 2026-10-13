"use client";

import { useState } from "react";
import { DRIVER_COLUMN_WIDTH, FIELDS, type LoadFields } from "@/lib/fields";
import { displayValue } from "@/lib/format";

interface SheetData {
  fileName: string;
  headerLines: [string, string][];
  showDriver: boolean;
  totals: string;
  rows: { driver: string; fields: LoadFields }[];
}

const SCALE = 2; // crisp after a text message compresses it

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

/** Draws the log sheet onto a canvas and returns it as a JPG, the format phones text. */
async function drawSheet(data: SheetData): Promise<Blob> {
  const root = getComputedStyle(document.documentElement);
  const sans = getComputedStyle(document.body).fontFamily;
  const mono = root.getPropertyValue("--font-mono").trim() || "monospace";

  const cols = [
    ...(data.showDriver ? [{ label: "Driver", width: DRIVER_COLUMN_WIDTH, left: true, value: (r: SheetData["rows"][number]) => r.driver }] : []),
    ...FIELDS.map((f) => ({
      label: f.sheetLabel,
      // Same widths as the on-screen sheet; Comments gets a little more room in the image.
      width: f.key === "comments" ? 220 : f.width,
      left: f.key === "comments",
      value: (r: SheetData["rows"][number]) => (f.key === "comments" ? r.fields.comments : displayValue(f.key, r.fields[f.key])),
    })),
  ];
  const pad = 32;
  const tableW = cols.reduce((a, c) => a + c.width, 0);
  const headTop = 150;
  const headH = 44;
  const rowH = 34;
  const rows = Math.max(data.rows.length, 1);
  const W = tableW + pad * 2;
  const H = headTop + headH + rows * rowH + 70;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ctx.strokeStyle = "#161C2A";
  ctx.lineWidth = 1;

  const logo = await loadImage("/indeca-logo.png").catch(() => null);
  if (logo) ctx.drawImage(logo, pad, 20, 180, (180 * logo.height) / logo.width);

  let y = 104;
  for (const [label, value] of data.headerLines) {
    ctx.font = `14px ${sans}`;
    ctx.fillStyle = "#565B66";
    ctx.fillText(label, pad, y);
    ctx.font = `600 14px ${sans}`;
    ctx.fillStyle = "#161C2A";
    ctx.fillText(value, pad + 130, y);
    ctx.beginPath();
    ctx.moveTo(pad, y + 6);
    ctx.lineTo(pad + 540, y + 6);
    ctx.stroke();
    y += 24;
  }

  // Column headings
  let x = pad;
  ctx.font = `600 11px ${sans}`;
  ctx.textAlign = "center";
  for (const c of cols) {
    const parts = c.label.split("\n");
    parts.forEach((p, j) => ctx.fillText(p, x + c.width / 2, headTop + headH - 8 - (parts.length - 1 - j) * 13));
    x += c.width;
  }

  // Rows
  let rowY = headTop + headH;
  for (const r of data.rows) {
    x = pad;
    for (const c of cols) {
      const isText = c.left;
      ctx.font = isText ? `13px ${sans}` : `13px ${mono}`;
      ctx.textAlign = isText ? "left" : "center";
      const value = c.value(r);
      // Any value too long for its column shrinks to fit before anything is cut off.
      const w = ctx.measureText(value).width;
      if (w > c.width - 10) ctx.font = `${Math.max(8, Math.floor((13 * (c.width - 10)) / w))}px ${isText ? sans : mono}`;
      const text = fit(ctx, value, c.width - 10);
      ctx.fillText(text, isText ? x + 6 : x + c.width / 2, rowY + rowH / 2 + 5);
      x += c.width;
    }
    rowY += rowH;
  }
  if (!data.rows.length) {
    ctx.font = `14px ${sans}`;
    ctx.textAlign = "left";
    ctx.fillStyle = "#565B66";
    ctx.fillText("No loads logged for these dates.", pad + 8, rowY + rowH / 2 + 5);
    ctx.fillStyle = "#161C2A";
    rowY += rowH;
  }

  // Grid
  ctx.beginPath();
  for (let ly = headTop; ly <= rowY; ly += ly === headTop ? headH : rowH) {
    ctx.moveTo(pad, ly);
    ctx.lineTo(pad + tableW, ly);
  }
  x = pad;
  ctx.moveTo(x, headTop);
  ctx.lineTo(x, rowY);
  for (const c of cols) {
    x += c.width;
    ctx.moveTo(x, headTop);
    ctx.lineTo(x, rowY);
  }
  ctx.stroke();

  ctx.font = `14px ${sans}`;
  ctx.textAlign = "left";
  ctx.fillText(data.totals, pad, rowY + 32);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))), "image/jpeg", 0.92),
  );
}

export default function ImageExport({ query }: { query: string }) {
  const [busy, setBusy] = useState(false);

  async function exportImage() {
    setBusy(true);
    try {
      const res = await fetch(`/api/export?${query}&format=json`);
      if (!res.ok) throw new Error("Couldn't load the loads");
      const data = (await res.json()) as SheetData;
      const blob = await drawSheet(data);
      const file = new File([blob], data.fileName, { type: "image/jpeg" });

      // On a phone, open the share sheet so it can go straight into a text message.
      const touch = window.matchMedia("(pointer: coarse)").matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: data.fileName }).catch(() => undefined);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-outline" onClick={exportImage} disabled={busy}>
      {busy ? "Making…" : "JPEG"}
    </button>
  );
}
