"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PhotoRef } from "@/lib/types";
import { uploadPhoto, photoUrl } from "@/lib/client-api";
import { Camera, type Shot } from "@/components/Camera";
import { CameraIcon, WrenchIcon } from "@/components/icons";

/** "Mark repaired" for one failed item: what was done, plus an optional photo of the fix. */
export function ResolveDefect({ inspectionId, itemId, resolved, stamp }: { inspectionId: string; itemId: string; resolved: boolean; stamp: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<PhotoRef | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(body: object) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "Didn't save");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function usePhoto(shot: Shot) {
    setCamera(false);
    try {
      setPhoto(await uploadPhoto(shot.blob));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (resolved) {
    return (
      <button className="btn btn-quiet" style={{ alignSelf: "flex-start", minHeight: 36, fontSize: 13 }} disabled={busy} onClick={() => post({ itemId, undo: true })}>
        Undo repaired
      </button>
    );
  }
  if (!open) {
    return (
      <button className="btn btn-outline" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>
        <WrenchIcon /> Mark repaired
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "var(--ground)" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="field-label">What was done?</span>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Replaced the brake chamber, tested, no leak" />
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {photo ? <img src={photoUrl(photo.key)} alt="Repair photo" style={{ width: 96, height: 72, objectFit: "cover" }} /> : null}
        <button type="button" className="btn btn-quiet" onClick={() => setCamera(true)}>
          <CameraIcon /> {photo ? "Retake photo" : "Photo of the fix (optional)"}
        </button>
      </div>
      {error && <div className="field-error">{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={busy || !note.trim()} onClick={() => post({ itemId, note, photo })}>
          {busy ? "Saving…" : "Save as repaired"}
        </button>
        <button className="btn btn-quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {camera && <Camera title="Photo of the repair" stamp={stamp} onClose={() => setCamera(false)} onUse={usePhoto} />}
    </div>
  );
}
