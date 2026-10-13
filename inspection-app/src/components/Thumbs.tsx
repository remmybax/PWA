"use client";

import { useState } from "react";
import { Lightbox } from "./Lightbox";

export interface Thumb {
  src: string;
  caption: string;
  repair?: boolean;
}

/** A grid of photo thumbnails that open full screen. */
export function Thumbs({ photos, captions = false, size = 120 }: { photos: Thumb[]; captions?: boolean; size?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="thumbs" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
        {photos.map((p, i) => (
          <button key={`${p.src}-${i}`} type="button" className="thumb" onClick={() => setOpen(i)} aria-label={`Open photo: ${p.caption}`}>
            <img src={p.src} alt="" loading="lazy" />
            {(captions || p.repair) && <span className={`thumb-cap ${p.repair ? "repair" : ""}`}>{p.repair ? `Repaired: ${p.caption}` : p.caption}</span>}
          </button>
        ))}
      </div>
      {open !== null && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
