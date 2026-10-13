"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, CloseIcon } from "./icons";

export interface LightboxPhoto {
  src: string;
  caption: string;
}

/** Full-screen photo viewer with previous/next and keyboard arrows. */
export function Lightbox({ photos, index, onIndex, onClose }: { photos: LightboxPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const p = photos[index];
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, photos.length, onIndex, onClose]);
  if (!p) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(18,22,31,0.96)", display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", color: "#fff" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
          {p.caption} <span style={{ color: "var(--camera-muted)", fontWeight: 400 }}>({index + 1} of {photos.length})</span>
        </div>
        <button className="btn btn-quiet" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <img src={p.src} alt={p.caption} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
        {index > 0 && (
          <button
            className="btn btn-quiet"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
            aria-label="Previous photo"
          >
            <ChevronLeft />
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            className="btn btn-quiet"
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index + 1);
            }}
            aria-label="Next photo"
          >
            <ChevronRight />
          </button>
        )}
      </div>
    </div>
  );
}
