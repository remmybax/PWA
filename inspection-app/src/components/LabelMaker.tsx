"use client";

// Makes the QR sticker as a picture sized for the Nelko PM220 (203 dpi thermal). Save or share it,
// open it in the Nelko app, and print. Pure black on white, because thermal printers have no grey.

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DownloadIcon, ShareIcon } from "./icons";

const DPMM = 203 / 25.4; // dots per millimetre at 203 dpi

const SIZES = [
  { id: "50x30", w: 50, h: 30, label: "50 × 30 mm" },
  { id: "40x30", w: 40, h: 30, label: "40 × 30 mm" },
  { id: "50x50", w: 50, h: 50, label: "50 × 50 mm" },
] as const;

type SizeId = (typeof SIZES)[number]["id"];

function cssFont(variable: string, fallback: string): string {
  const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(variable).trim() : "";
  return v || fallback;
}

/** Shrinks the font until the text fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, weight: string, family: string, start: number): number {
  let size = start;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 8 && ctx.measureText(text).width > maxW) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

async function draw(canvas: HTMLCanvasElement, url: string, lines: { unit: string; trailer: string; date: string }, size: (typeof SIZES)[number]) {
  const W = Math.round(size.w * DPMM);
  const H = Math.round(size.h * DPMM);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";

  const heading = cssFont("--font-heading", "Arial Narrow, sans-serif");
  const mono = cssFont("--font-mono", "monospace");
  const pad = Math.round(1.5 * DPMM);
  const square = size.h === size.w;

  const qr = document.createElement("canvas");
  const qrSide = square ? Math.round(H * 0.62) : H - pad * 2;
  await QRCode.toCanvas(qr, url, { errorCorrectionLevel: "M", margin: 0, width: qrSide, color: { dark: "#000000", light: "#FFFFFF" } });

  if (square) {
    ctx.drawImage(qr, (W - qrSide) / 2, pad, qrSide, qrSide);
    let y = pad + qrSide + Math.round(1.2 * DPMM);
    const maxW = W - pad * 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const s1 = fit(ctx, `TRUCK ${lines.unit}`, maxW, "700", heading, Math.round(H * 0.11));
    ctx.fillText(`TRUCK ${lines.unit}`, W / 2, y);
    y += s1 + 4;
    const sub = [lines.trailer, lines.date].filter(Boolean).join(" · ");
    const s2 = fit(ctx, sub, maxW, "500", mono, Math.round(H * 0.065));
    ctx.fillText(sub, W / 2, y);
    y += s2 + 4;
    fit(ctx, "SCAN FOR INSPECTION REPORT", maxW, "700", heading, Math.round(H * 0.05));
    ctx.fillText("SCAN FOR INSPECTION REPORT", W / 2, y);
    return;
  }

  ctx.drawImage(qr, pad, pad, qrSide, qrSide);
  const x = pad + qrSide + Math.round(1.8 * DPMM);
  const maxW = W - x - pad;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let y = pad;
  const s0 = fit(ctx, "INDECA", maxW, "700", heading, Math.round(H * 0.12));
  ctx.fillText("INDECA", x, y);
  y += s0 + 2;
  ctx.fillRect(x, y, maxW, 3);
  y += 8;
  const s1 = fit(ctx, `TRUCK ${lines.unit}`, maxW, "700", heading, Math.round(H * 0.2));
  ctx.fillText(`TRUCK ${lines.unit}`, x, y);
  y += s1 + 2;
  if (lines.trailer) {
    const s2 = fit(ctx, lines.trailer, maxW, "600", heading, Math.round(H * 0.13));
    ctx.fillText(lines.trailer, x, y);
    y += s2 + 4;
  }
  const s3 = fit(ctx, lines.date, maxW, "500", mono, Math.round(H * 0.1));
  ctx.fillText(lines.date, x, y);
  y += s3 + 4;
  ctx.textBaseline = "bottom";
  fit(ctx, "SCAN FOR REPORT", maxW, "700", heading, Math.round(H * 0.085));
  ctx.fillText("SCAN FOR REPORT", x, H - pad);
}

export function LabelMaker({ url, unit, trailer, date, fileName }: { url: string; unit: string; trailer: string; date: string; fileName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<SizeId>("50x30");
  const [png, setPng] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const s = SIZES.find((x) => x.id === size)!;
    (async () => {
      await document.fonts?.ready;
      if (!canvasRef.current || cancelled) return;
      await draw(canvasRef.current, url, { unit, trailer: trailer ? `TRAILER ${trailer}` : "", date }, s);
      if (!cancelled) setPng(canvasRef.current.toDataURL("image/png"));
    })();
    return () => {
      cancelled = true;
    };
  }, [size, url, unit, trailer, date]);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && "canShare" in navigator);
  }, []);

  async function blob(): Promise<Blob> {
    return new Promise((resolve, reject) => canvasRef.current!.toBlob((b) => (b ? resolve(b) : reject(new Error("No label"))), "image/png"));
  }

  async function share() {
    try {
      const file = new File([await blob()], `${fileName}-${size}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `QR label, truck ${unit}` });
        setMsg("");
      } else {
        setMsg("This phone can't share pictures from the browser. Use Save picture, then open it in the Nelko app.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Couldn't share. Use Save picture instead.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Link copied. In the Nelko app you can also make a QR from this link.");
    } catch {
      setMsg(url);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="seg" role="group" aria-label="Label size">
        {SIZES.map((s) => (
          <button key={s.id} type="button" aria-pressed={size === s.id} onClick={() => setSize(s.id)} style={{ minHeight: 40, fontSize: 14 }}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ background: "var(--chip)", padding: 16, display: "flex", justifyContent: "center" }}>
        <canvas ref={canvasRef} style={{ display: "none" }} />
        {png ? (
          <img
            src={png}
            alt={`QR label for truck ${unit}`}
            style={{ width: size === "50x50" ? 200 : size === "40x30" ? 220 : 280, maxWidth: "100%", background: "#fff", border: "1px solid var(--lines)", imageRendering: "pixelated" }}
          />
        ) : (
          <div style={{ height: 160, color: "var(--muted)", display: "flex", alignItems: "center" }}>Making label…</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canShare && (
          <button type="button" className="btn btn-primary" style={{ flex: "1 1 160px" }} onClick={share} disabled={!png}>
            <ShareIcon /> Share to Nelko app
          </button>
        )}
        <a className="btn btn-outline" style={{ flex: "1 1 160px" }} href={png || undefined} download={`${fileName}-${size}.png`} aria-disabled={!png}>
          <DownloadIcon /> Save picture
        </a>
        <button type="button" className="btn btn-quiet" style={{ flex: "1 1 120px" }} onClick={copy}>
          Copy link
        </button>
      </div>
      {msg && <div className="note-info" style={{ overflowWrap: "anywhere" }}>{msg}</div>}
      <p className="lead" style={{ fontSize: 13 }}>
        To print: Share or save the picture, open the Nelko app, add it as an image on a {SIZES.find((s) => s.id === size)!.label} label, and print. Stick it in the box
        at the top right of the paper report.
      </p>
    </div>
  );
}
