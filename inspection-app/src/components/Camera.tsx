"use client";

// Full-screen camera, same idea as OneTrip: the photo is taken live, not picked from the gallery,
// so it proves someone was standing at the truck. Every photo is shrunk on the phone and stamped
// with the unit, item and time before upload.
//
// The live viewfinder needs HTTPS (or localhost). Over plain HTTP, e.g. a phone opening the PC's
// address on the Wi-Fi, browsers block it, so the button falls back to the phone's own camera.

import { useEffect, useRef, useState } from "react";
import { CameraIcon, CloseIcon, FlashIcon } from "./icons";
import styles from "./camera.module.css";

export interface Shot {
  blob: Blob;
  url: string;
}

const MAX_SIDE = 1600;

function stampText(stamp: string): string {
  const d = new Date();
  const date = d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${stamp} · ${date} ${time}`;
}

/** Draws the source scaled down, with a navy strip along the bottom carrying the stamp. */
function render(src: CanvasImageSource, w: number, h: number, stamp: string): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0, cw, ch);
  const band = Math.max(28, Math.round(ch * 0.045));
  ctx.fillStyle = "rgba(13, 8, 92, 0.82)";
  ctx.fillRect(0, ch - band, cw, band);
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${Math.round(band * 0.5)}px "IBM Plex Mono", monospace`;
  ctx.textBaseline = "middle";
  ctx.fillText(stampText(stamp), Math.round(band * 0.4), ch - band / 2, cw - band);
  ctx.fillStyle = "#F05004";
  ctx.fillRect(0, ch - band, Math.max(6, Math.round(band * 0.18)), band);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't save the photo"))), "image/jpeg", 0.82));
}

async function fromFile(file: File, stamp: string): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    return await render(bitmap, bitmap.width, bitmap.height, stamp);
  } finally {
    bitmap.close();
  }
}

export function Camera({ title, stamp, onClose, onUse }: { title: string; stamp: string; onClose: () => void; onUse: (shot: Shot) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState<"starting" | "on" | "off">("starting");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setLive("off");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setTorch(caps?.torch ? false : null);
        setLive("on");
      } catch {
        setLive("off");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    try {
      const blob = await render(v, v.videoWidth, v.videoHeight, stamp);
      setShot({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await fromFile(file, stamp);
      setShot({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("Couldn't open that photo. Try again.");
    }
  }

  return (
    <div className={styles.cam} role="dialog" aria-modal="true" aria-label={`Photo: ${title}`}>
      <div className={styles.top}>
        <div className={styles.title}>{title}</div>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Close camera">
          <CloseIcon size={22} />
        </button>
      </div>

      <div className={styles.view}>
        {shot ? (
          <img src={shot.url} alt="Photo just taken" className={styles.media} />
        ) : (
          <>
            <video ref={videoRef} className={styles.media} playsInline muted style={{ display: live === "on" ? "block" : "none" }} />
            {live !== "on" && (
              <div className={styles.placeholder}>
                {live === "starting" ? "Starting camera…" : "Tap the shutter to open the phone's camera."}
              </div>
            )}
            <span className={`${styles.corner} ${styles.tl}`} />
            <span className={`${styles.corner} ${styles.tr}`} />
            <span className={`${styles.corner} ${styles.bl}`} />
            <span className={`${styles.corner} ${styles.br}`} />
          </>
        )}
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.controls}>
        {shot ? (
          <>
            <button className="btn btn-quiet" style={{ flex: 1, minHeight: 56 }} onClick={() => setShot(null)}>
              Retake
            </button>
            <button className="btn btn-orange" style={{ flex: 2, minHeight: 56 }} onClick={() => onUse(shot)}>
              Use photo
            </button>
          </>
        ) : (
          <>
            <button className={styles.side} onClick={toggleTorch} disabled={torch === null} aria-pressed={Boolean(torch)} aria-label="Flash">
              <FlashIcon size={22} />
              <span>{torch === null ? "No flash" : torch ? "Flash on" : "Flash"}</span>
            </button>
            <button
              className={styles.shutter}
              aria-label="Take photo"
              onClick={() => (live === "on" ? capture() : fileRef.current?.click())}
              disabled={live === "starting"}
            >
              <span />
            </button>
            <div className={styles.side} aria-hidden="true">
              <CameraIcon size={22} />
              <span>{live === "on" ? "Live" : "Phone camera"}</span>
            </div>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={picked} hidden />
    </div>
  );
}
