"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TicketReading } from "@/lib/types";
import { ListIcon, FlashIcon, UploadIcon } from "@/components/icons";
import Review from "./Review";
import styles from "./scan.module.css";

interface Props {
  loadNumber: number;
  todayLabel: string;
  loggedToday: number;
  lastStation: string;
  todayISO: string;
}

type Stage =
  | { name: "camera"; error?: string }
  | { name: "reading"; photoUrl: string }
  | { name: "review"; photoUrl: string; photoKey: string; reading: TicketReading };

/** Longest side of the uploaded photo. Enough for small print; keeps uploads quick on one bar of signal. */
const MAX_SIDE = 2200;

async function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process photo"))), "image/jpeg", 0.88),
  );
}

async function fileToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return await toJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export default function ScanFlow(props: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "camera" });

  const submitPhoto = useCallback(async (blob: Blob) => {
    const photoUrl = URL.createObjectURL(blob);
    setStage({ name: "reading", photoUrl });
    try {
      const form = new FormData();
      form.append("photo", blob, "ticket.jpg");
      const res = await fetch("/api/read-ticket", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/signin");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Couldn't read the ticket");
      setStage({ name: "review", photoUrl, photoKey: data.photoKey, reading: data.reading });
    } catch (e) {
      URL.revokeObjectURL(photoUrl);
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setStage({
        name: "camera",
        error: offline ? "No signal. Keep the ticket and try again when you have service." : (e as Error).message,
      });
    }
  }, [router]);

  const retake = useCallback(() => {
    if (stage.name !== "camera") URL.revokeObjectURL(stage.photoUrl);
    setStage({ name: "camera" });
  }, [stage]);

  if (stage.name === "review") {
    return (
      <Review
        photoUrl={stage.photoUrl}
        photoKey={stage.photoKey}
        reading={stage.reading}
        lastStation={props.lastStation}
        todayISO={props.todayISO}
        onRetake={retake}
      />
    );
  }

  return <Camera {...props} reading={stage.name === "reading"} error={stage.name === "camera" ? stage.error : undefined} onPhoto={submitPhoto} />;
}

function Camera({
  loadNumber,
  todayLabel,
  loggedToday,
  reading,
  error,
  onPhoto,
}: Props & { reading: boolean; error?: string; onPhoto: (b: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The photo just taken, shown in the frame straight away so the driver can see it worked. The
  // downscaled JPEG for upload is made in the background meanwhile (a big phone photo takes a few
  // seconds, which used to leave the screen looking like nothing had happened).
  const [preview, setPreview] = useState<{ url: string; jpeg: Promise<Blob> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return; // e.g. plain http on a phone: use the file picker
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setLive(true);
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchAvailable(Boolean(caps.torch));
      } catch {
        setLive(false);
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  async function shutter() {
    if (reading) return;
    const video = videoRef.current;
    if (!live || !video || !video.videoWidth) {
      fileRef.current?.click();
      return;
    }
    try {
      const jpeg = await toJpeg(video, video.videoWidth, video.videoHeight);
      setProblem(null);
      setPreview({ url: URL.createObjectURL(jpeg), jpeg: Promise.resolve(jpeg) });
    } catch (e) {
      setProblem((e as Error).message);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProblem(null);
    const jpeg = fileToJpeg(file);
    jpeg.catch(() => undefined); // handled when the driver taps Use photo
    setPreview({ url: URL.createObjectURL(file), jpeg });
  }

  async function usePhoto() {
    if (!preview || reading) return;
    try {
      onPhoto(await preview.jpeg);
    } catch {
      setProblem("That photo couldn't be opened. Try taking it again.");
    }
  }

  function retakePhoto() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setProblem(null);
  }

  const message = problem ?? error;

  return (
    <main className={styles.camera}>
      <header className="appbar">
        <img src="/indeca-logo.png" alt="Indeca Crude Xpress" />
        <Link href="/my-log" className="btn btn-outline" style={{ fontSize: 14 }}>
          <ListIcon /> My log
        </Link>
      </header>

      <div className={styles.cameraTitle}>
        <h1 className={styles.loadTitle}>Load {loadNumber}</h1>
        <div className={styles.loadSub}>
          {todayLabel} · {loggedToday} logged today
        </div>
      </div>

      <div className={styles.viewfinder}>
        <video ref={videoRef} className={styles.video} playsInline muted hidden={!live || Boolean(preview)} />
        {preview && <img src={preview.url} alt="Ticket photo just taken" className={styles.previewImg} />}
        <div className={styles.frame} aria-hidden="true" hidden={Boolean(preview)}>
          <span className={`${styles.corner} ${styles.tl}`} />
          <span className={`${styles.corner} ${styles.tr}`} />
          <span className={`${styles.corner} ${styles.bl}`} />
          <span className={`${styles.corner} ${styles.br}`} />
          {!live && (
            <div className={styles.ghostTicket}>
              <i style={{ height: 10, width: "60%", background: "#353D4E" }} />
              {[90, 75, 85, 55, 80, 70].map((w) => (
                <i key={w} style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
        </div>
        <div className={`${styles.hint} ${preview ? styles.hintOnPhoto : ""}`}>
          {reading ? (
            <>
              <div className={styles.hintTitle}>Reading the ticket…</div>
              <div className={styles.hintBody}>Hang on a few seconds.</div>
            </>
          ) : message ? (
            <>
              <div className={styles.hintTitle}>Try again</div>
              <div className={styles.hintBody} role="alert">{message}</div>
            </>
          ) : preview ? (
            <>
              <div className={styles.hintTitle}>Is the whole ticket readable?</div>
              <div className={styles.hintBody}>Tap Use photo, or Retake if it&apos;s blurry or cut off.</div>
            </>
          ) : (
            <>
              <div className={styles.hintTitle}>Fit the whole ticket in the frame</div>
              <div className={styles.hintBody}>Flat surface, no glare. The app reads every printed field for you.</div>
            </>
          )}
        </div>
        {reading && <div className={styles.readingBar} aria-hidden="true" />}
      </div>

      {preview ? (
        <div className={styles.previewControls}>
          <button type="button" className={`btn ${styles.retakeBtn}`} onClick={retakePhoto} disabled={reading}>
            Retake
          </button>
          <button type="button" className="btn btn-orange btn-big" onClick={usePhoto} disabled={reading}>
            {reading ? "Reading…" : "Use photo"}
          </button>
        </div>
      ) : (
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.sideButton}
          aria-label={torchOn ? "Turn flash off" : "Turn flash on"}
          aria-pressed={torchOn}
          onClick={toggleTorch}
          disabled={!torchAvailable || reading}
          style={torchOn ? { background: "#F2F3F5", color: "#12161F" } : undefined}
        >
          <FlashIcon size={22} />
        </button>
        <button type="button" aria-label="Capture ticket" className={styles.shutter} onClick={shutter} disabled={reading}>
          <span />
        </button>
        <button
          type="button"
          className={styles.sideButton}
          aria-label="Choose a photo instead"
          onClick={() => galleryRef.current?.click()}
          disabled={reading}
        >
          <UploadIcon size={22} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          tabIndex={-1}
          onChange={onFile}
        />
        <input ref={galleryRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} onChange={onFile} />
      </div>
      )}
    </main>
  );
}
