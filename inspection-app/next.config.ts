import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode badge confuses people testing on a phone; it never shows in production.
  devIndicators: false,
  // Lets a phone on the same Wi-Fi open the dev server by the PC's address (e.g. 192.168.4.92:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  experimental: {
    // Inspection photos are sent one at a time, already shrunk on the phone, but allow headroom.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
