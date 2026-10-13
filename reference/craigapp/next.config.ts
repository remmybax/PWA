import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs", "pdf-lib"],
  // The dev-mode "Rendering…" badge confuses people testing on a phone; it never shows in production.
  devIndicators: false,
  // Lets a phone on the same Wi-Fi open the dev server by the PC's address (e.g. 192.168.4.92:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
