import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Indeca Truck Inspection",
    short_name: "Inspection",
    description: "Monthly truck inspections with photos, and the fleet dashboard.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F2F3F5",
    theme_color: "#0D085C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
