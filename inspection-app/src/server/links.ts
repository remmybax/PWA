import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";

/**
 * The address the QR code points to. Set PUBLIC_BASE_URL once the app is online (e.g.
 * https://inspect.example.com). Without it, the address this page was opened on is used, which in
 * the local demo is the PC's Wi-Fi address, so the QR only works for phones on that Wi-Fi.
 */
export async function baseUrl(): Promise<string> {
  const fixed = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export async function reportUrl(token: string): Promise<string> {
  return `${await baseUrl()}/r/${token}`;
}

/** Square-module QR as an SVG string, navy on white. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0D085C", light: "#FFFFFF" } });
}
