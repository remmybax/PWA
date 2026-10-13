import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Indeca Ticket Log",
    short_name: "Ticket Log",
    description: "Photograph run tickets and keep your weekly load log.",
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
