"use client";

// One checklist item: its answer control, photos, and (on a fail) the note. Every change saves
// straight away; typing saves after a short pause.

import { useEffect, useRef, useState } from "react";
import type { ChecklistItem } from "@/lib/checklist";
import { itemProblem, verdictOf } from "@/lib/inspection";
import type { ItemResult, Verdict } from "@/lib/types";
import { ApiError, photoUrl, saveItem, uploadPhoto } from "@/lib/client-api";
import { enqueuePhoto, PHOTO_UPLOADED, queuedPhotos, removeQueued, type QueuedPhoto } from "@/lib/photo-queue";
import { Camera, type Shot } from "@/components/Camera";
import { Lightbox } from "@/components/Lightbox";
import { CameraIcon, CheckIcon, CloseIcon, WarnIcon } from "@/components/icons";
import styles from "./section.module.css";

type SaveState = "idle" | "saving" | "saved" | "queued" | "error";

export function ItemCard({
  item,
  initial,
  inspectionId,
  stamp,
  today,
  onChange,
}: {
  item: ChecklistItem;
  initial: ItemResult | undefined;
  inspectionId: string;
  stamp: string;
  today: string;
  onChange: (id: string, r: ItemResult) => void;
}) {
  const [r, setR] = useState<ItemResult>(initial ?? { photos: [] });
  const [save, setSave] = useState<{ state: SaveState; error?: string }>({ state: "idle" });
  const [camera, setCamera] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [view, setView] = useState<number | null>(null);
  const [waiting, setWaiting] = useState<{ id: string; url: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(r);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Photos taken with no signal: show them as waiting, and attach each one once it has uploaded.
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    async function attach(p: QueuedPhoto) {
      if (!p.ref || latest.current.photos.some((x) => x.key === p.ref!.key)) {
        if (p.ref) await removeQueued(p.id);
        return;
      }
      update({ photos: [...latest.current.photos, p.ref] });
      await removeQueued(p.id);
      setWaiting((w) => w.filter((x) => x.id !== p.id));
    }
    queuedPhotos(inspectionId, item.id).then((list) => {
      if (!alive) return;
      const notYet = list.filter((p) => !p.ref);
      setWaiting(
        notYet.map((p) => {
          const url = URL.createObjectURL(p.blob);
          urls.push(url);
          return { id: p.id, url };
        }),
      );
      list.filter((p) => p.ref).forEach(attach);
    });
    const onUploaded = (e: Event) => {
      const p = (e as CustomEvent<QueuedPhoto>).detail;
      if (p.inspectionId === inspectionId && p.itemId === item.id) attach(p);
    };
    window.addEventListener(PHOTO_UPLOADED, onUploaded);
    return () => {
      alive = false;
      window.removeEventListener(PHOTO_UPLOADED, onUploaded);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId, item.id]);

  async function send(next: ItemResult) {
    setSave({ state: "saving" });
    const out = await saveItem(inspectionId, item.id, next);
    if (latest.current !== next) return; // a newer change is on its way
    if (out.saved) setSave({ state: "saved" });
    else setSave({ state: out.queued ? "queued" : "error", error: out.error });
  }

  function update(change: Partial<ItemResult>, delay = 0) {
    const next = { ...latest.current, ...change };
    latest.current = next;
    setR(next);
    onChange(item.id, next);
    if (timer.current) clearTimeout(timer.current);
    if (delay) timer.current = setTimeout(() => send(next), delay);
    else send(next);
  }

  async function usePhoto(shot: Shot) {
    setCamera(false);
    setUploading((n) => n + 1);
    try {
      const ref = await uploadPhoto(shot.blob);
      update({ photos: [...latest.current.photos, ref] });
    } catch (e) {
      if (e instanceof ApiError) {
        setSave({ state: "error", error: `Photo didn't upload: ${e.message}` });
      } else {
        // No signal: keep it on the phone; it uploads by itself later.
        try {
          const q = await enqueuePhoto(inspectionId, item.id, shot.blob);
          setWaiting((w) => [...w, { id: q.id, url: URL.createObjectURL(q.blob) }]);
          setSave({ state: "queued", error: "No signal. The photo is saved on the phone and uploads when signal is back." });
        } catch {
          setSave({ state: "error", error: "No signal, and the phone couldn't keep the photo. Take it again when you have signal." });
        }
      }
    } finally {
      setUploading((n) => n - 1);
    }
  }

  const verdict = verdictOf(item, r, today);
  const problem = itemProblem(item, r, today);
  const failed = verdict === "fail";
  const auto = (item.kind === "reading" && item.min !== undefined) || (item.kind === "count" && item.expected !== undefined);
  const needPhoto = item.photo === "required" || failed;

  function setVerdict(v: Verdict) {
    update({ verdict: latest.current.verdict === v ? undefined : v });
  }

  return (
    <article className={`${styles.item} ${failed ? styles.itemFail : ""} ${!problem ? styles.itemDone : ""}`} id={`item-${item.id}`}>
      <header className={styles.itemHead}>
        <div className={styles.itemLabel}>{item.label}</div>
        <div className={styles.itemState}>
          {!problem ? (
            <span className={styles.done}>
              <CheckIcon size={16} /> Done
            </span>
          ) : verdict ? (
            <span className={styles.todo}>{problem}</span>
          ) : null}
        </div>
      </header>
      {item.help && <p className={styles.help}>{item.help}</p>}

      {(item.kind === "check" || item.kind === "doc") && (
        <div className="seg" role="group" aria-label={item.label}>
          <button type="button" aria-pressed={r.verdict === "pass"} onClick={() => setVerdict("pass")}>
            {item.kind === "doc" ? "Present" : "Pass"}
          </button>
          <button type="button" className="seg-fail" aria-pressed={r.verdict === "fail"} onClick={() => setVerdict("fail")}>
            {item.kind === "doc" ? "Missing" : "Fail"}
          </button>
          <button type="button" aria-pressed={r.verdict === "na"} onClick={() => setVerdict("na")}>
            N/A
          </button>
        </div>
      )}

      {item.kind === "doc" && item.date && r.verdict === "pass" && (
        <label className={styles.field}>
          <span className="field-label">{item.date} on</span>
          <input
            type="date"
            className="input mono"
            value={r.date ?? ""}
            onChange={(e) => update({ date: e.target.value || undefined })}
            aria-invalid={Boolean(r.date && r.date < today)}
          />
          {r.date && r.date < today && <span className="field-error">That date has passed, so this counts as a fail.</span>}
        </label>
      )}

      {(item.kind === "reading" || item.kind === "count" || item.kind === "text") && r.verdict !== "na" && (
        <div className={styles.valueRow}>
          <input
            className={`input ${item.kind === "text" ? "" : "mono"}`}
            inputMode={item.kind === "text" ? "text" : "decimal"}
            value={r.value ?? ""}
            placeholder={item.kind === "count" ? `Should be ${item.expected}` : item.kind === "text" ? "" : "0"}
            onChange={(e) => update({ value: e.target.value, verdict: auto ? undefined : latest.current.verdict }, 700)}
            onBlur={() => {
              if (timer.current) {
                clearTimeout(timer.current);
                send(latest.current);
              }
            }}
            aria-label={item.label}
            style={{ maxWidth: item.kind === "text" ? "none" : 160 }}
            autoCapitalize={item.kind === "text" ? "characters" : undefined}
          />
          {item.unit && <span className={styles.unit}>{item.unit}</span>}
          {item.kind === "count" && <span className={styles.unit}>of {item.expected}</span>}
          {auto && verdict && verdict !== "na" && (
            <span className={`badge ${verdict === "pass" ? "badge-ok" : "badge-bad"}`}>{verdict === "pass" ? "OK" : item.kind === "count" ? "Short" : `Below ${item.min}`}</span>
          )}
        </div>
      )}
      {(item.kind === "reading" || item.kind === "count" || item.kind === "text") && (
        <div className={styles.naRow}>
          {!auto && item.kind !== "text" && r.verdict !== "na" && (
            <button type="button" className={`btn btn-quiet ${styles.small}`} aria-pressed={r.verdict === "fail"} onClick={() => setVerdict("fail")}>
              {r.verdict === "fail" ? "Marked as a problem" : "Mark as a problem"}
            </button>
          )}
          <button type="button" className={`btn btn-quiet ${styles.small}`} aria-pressed={r.verdict === "na"} onClick={() => setVerdict("na")}>
            {r.verdict === "na" ? "N/A (tap to undo)" : "N/A"}
          </button>
        </div>
      )}

      {failed && (
        <div className={styles.failBox}>
          <div className={styles.failTitle}>
            <WarnIcon size={18} /> What&apos;s wrong?
          </div>
          <textarea
            className="input"
            rows={2}
            value={r.note ?? ""}
            onChange={(e) => update({ note: e.target.value }, 800)}
            onBlur={() => {
              if (timer.current) {
                clearTimeout(timer.current);
                send(latest.current);
              }
            }}
            placeholder="Where it is and what you see"
            aria-label={`What's wrong with ${item.label}`}
          />
          <span className={styles.failHelp}>A failed item needs a note and a photo of the problem. It goes on the defect list for the shop.</span>
        </div>
      )}
      {!failed && r.verdict !== "na" && (item.kind === "check" || item.kind === "doc") && r.note !== undefined && (
        <textarea className="input" rows={2} value={r.note} onChange={(e) => update({ note: e.target.value }, 800)} placeholder="Note (optional)" />
      )}

      {r.verdict !== "na" && (needPhoto || item.photo === "optional" || r.photos.length > 0) && (
        <div className={styles.photos}>
          {r.photos.map((p, i) => (
            <div key={p.key} className={styles.photo}>
              <button type="button" className="thumb" onClick={() => setView(i)} aria-label={`View photo ${i + 1}`}>
                <img src={photoUrl(p.key)} alt="" loading="lazy" />
              </button>
              <button
                type="button"
                className={styles.remove}
                aria-label="Remove photo"
                onClick={() => update({ photos: latest.current.photos.filter((x) => x.key !== p.key) })}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
          {waiting.map((w) => (
            <div key={w.id} className={styles.photo}>
              <div className="thumb" style={{ cursor: "default" }}>
                <img src={w.url} alt="" />
                <span className="thumb-cap">Waiting for signal</span>
              </div>
            </div>
          ))}
          {uploading > 0 && <div className={`${styles.photo} ${styles.uploading}`}>Uploading…</div>}
          {r.photos.length < 6 && (
            <button type="button" className={`${styles.addPhoto} ${needPhoto && r.photos.length === 0 ? styles.addPhotoNeeded : ""}`} onClick={() => setCamera(true)}>
              <CameraIcon size={22} />
              <span>{r.photos.length ? "Add" : needPhoto ? (failed ? "Photo of problem" : "Take photo") : "Photo (optional)"}</span>
            </button>
          )}
        </div>
      )}

      {(item.kind === "check" || item.kind === "doc") && r.verdict && r.verdict !== "fail" && r.verdict !== "na" && r.note === undefined && (
        <button type="button" className={styles.linkBtn} onClick={() => update({ note: "" }, 100000)}>
          + Add a note
        </button>
      )}

      {save.state === "queued" && <div className={styles.saveQueued}>{save.error}</div>}
      {save.state === "error" && (
        <div className={styles.saveError} role="alert">
          {save.error}{" "}
          <button type="button" className={styles.linkBtn} onClick={() => send(latest.current)}>
            Try again
          </button>
        </div>
      )}

      {camera && <Camera title={item.label} stamp={`${stamp} · ${item.label.split(":")[0].slice(0, 40)}`} onClose={() => setCamera(false)} onUse={usePhoto} />}
      {view !== null && (
        <Lightbox photos={r.photos.map((p) => ({ src: photoUrl(p.key), caption: item.label }))} index={view} onIndex={setView} onClose={() => setView(null)} />
      )}
    </article>
  );
}
