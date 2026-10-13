"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FIELDS, FIELD_BY_KEY, type FieldKey, type LoadFields } from "@/lib/fields";
import { displayValue, normalizeField } from "@/lib/format";
import { isoInZone, timeInZone } from "@/lib/dates";
import type { Load } from "@/lib/types";
import { CloseIcon, ImageIcon } from "@/components/icons";
import styles from "./dispatch.module.css";

interface Props {
  load: Load;
  driverName: string;
  loggedLabel: string;
  canEdit: boolean;
  sheetHref: string;
}

function when(iso: string): string {
  const d = new Date(iso);
  return `${displayValue("date", isoInZone(d))} ${timeInZone(d)}`;
}

function label(key: FieldKey): string {
  return FIELD_BY_KEY[key].label;
}

function list(keys: FieldKey[]): string {
  const names = keys.map(label);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export default function LoadPanel({ load, driverName, loggedLabel, canEdit, sheetHref }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "history">("view");
  const [photoOpen, setPhotoOpen] = useState(false);

  const confirmed = FIELDS.filter((f) => load.status[f.key] === "confirmed").map((f) => f.key);
  const edited = FIELDS.filter((f) => load.status[f.key] === "edited").map((f) => f.key);
  const photoSrc = load.photoKey ? `/api/photos/${load.photoKey}` : null;

  return (
    <div className={styles.panelInner}>
      <div>
        <div className={styles.panelMeta}>
          {driverName} · {loggedLabel}
        </div>
        <h2 className={styles.panelTitle}>Ticket {load.fields.ticket || "—"}</h2>
      </div>

      <button type="button" className={styles.photo} onClick={() => setPhotoOpen(true)} aria-label="Open ticket photo beside the fields">
        {photoSrc ? (
          <img src={photoSrc} alt="Original ticket photo" />
        ) : (
          <span className={styles.photoPlaceholder}>
            <ImageIcon size={28} />
            No photo (sample data)
          </span>
        )}
      </button>

      {confirmed.length > 0 && (
        <div className={styles.noteConfirmed}>
          <strong>{list(confirmed)}</strong> {confirmed.length === 1 ? "wasn't" : "weren't"} read clearly. The driver checked{" "}
          {confirmed.length === 1 ? "it" : "them"} against the ticket. Compare with the photo.
        </div>
      )}
      {edited.length > 0 && (
        <div className={styles.noteEdited}>
          <strong>{list(edited)}</strong> {edited.length === 1 ? "was" : "were"} changed by dispatch. The original reading is kept in the
          history.
        </div>
      )}
      {load.reading?.notes && load.reading.reader !== "sample" && <div className={styles.readerNote}>Reader note: {load.reading.notes}</div>}

      {mode === "edit" ? (
        <EditForm load={load} onDone={() => setMode("view")} />
      ) : mode === "history" ? (
        <History load={load} driverName={driverName} onBack={() => setMode("view")} />
      ) : (
        <>
          <FieldGrid load={load} />
          <div className={styles.actions}>
            {canEdit && (
              <button type="button" className="btn btn-outline" style={{ flexGrow: 1 }} onClick={() => setMode("edit")}>
                Edit fields
              </button>
            )}
            <button type="button" className="btn btn-quiet" style={{ flexGrow: 1 }} onClick={() => setMode("history")}>
              Change history{load.history.length ? ` (${load.history.length})` : ""}
            </button>
          </div>
          <Link href={sheetHref} className={styles.smallLink}>
            {driverName}&apos;s weekly sheet
          </Link>
        </>
      )}

      {photoOpen && (
        <div className={styles.viewer} role="dialog" aria-label={`Ticket ${load.fields.ticket} photo and fields`}>
          <div className={styles.viewerPhoto}>
            {photoSrc ? <img src={photoSrc} alt="Original ticket photo" /> : <div className={styles.viewerNoPhoto}>No photo for this load (sample data)</div>}
          </div>
          <div className={styles.viewerFields}>
            <div className={styles.viewerHead}>
              <h2 className={styles.panelTitle}>Ticket {load.fields.ticket}</h2>
              <button type="button" className={styles.viewerClose} onClick={() => setPhotoOpen(false)} aria-label="Close">
                <CloseIcon size={22} />
              </button>
            </div>
            <FieldGrid load={load} columns={2} />
          </div>
        </div>
      )}
    </div>
  );
}

function FieldGrid({ load, columns = 3 }: { load: Load; columns?: number }) {
  return (
    <>
      <div className={styles.fieldGrid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {FIELDS.filter((f) => f.key !== "comments").map((f) => {
          const st = load.status[f.key];
          return (
            <div key={f.key} className={`${styles.field} ${st === "confirmed" ? styles.fieldConfirmed : st === "edited" ? styles.fieldEdited : ""}`}>
              <div className={styles.fieldLabel}>{f.label}</div>
              <div className={styles.fieldValue}>{displayValue(f.key, load.fields[f.key])}</div>
            </div>
          );
        })}
      </div>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>Comments</div>
        <div style={{ fontSize: 14 }}>{load.fields.comments || "—"}</div>
      </div>
    </>
  );
}

function History({ load, driverName, onBack }: { load: Load; driverName: string; onBack: () => void }) {
  const confirmed = FIELDS.filter((f) => load.status[f.key] === "confirmed" || load.reading?.flagged.includes(f.key));
  return (
    <div className={styles.history}>
      <div className="section-label">Change history</div>
      <ol className={styles.historyList}>
        {[...load.history].reverse().map((h, i) => (
          <li key={i}>
            <div className={styles.historyWhen}>{when(h.at)} · {h.byName}</div>
            <div>
              Changed <strong>{label(h.field)}</strong> from <code>{displayValue(h.field, h.from)}</code> to <code>{displayValue(h.field, h.to)}</code>
            </div>
            {h.note && <div className={styles.historyNote}>“{h.note}”</div>}
          </li>
        ))}
        {confirmed.map((f) => {
          const read = load.reading?.values[f.key] ?? "";
          const conf = load.reading?.confidence[f.key];
          return (
            <li key={`c-${f.key}`}>
              <div className={styles.historyWhen}>{when(load.loggedAt)} · {driverName}</div>
              <div>
                Confirmed <strong>{f.label}</strong>
                {read ? (
                  <>
                    {" "}(app read <code>{displayValue(f.key, read)}</code>
                    {conf !== undefined ? `, ${Math.round(conf * 100)}% sure` : ""})
                  </>
                ) : (
                  " (app couldn't read it)"
                )}
              </div>
            </li>
          );
        })}
        <li>
          <div className={styles.historyWhen}>{when(load.loggedAt)} · {driverName}</div>
          <div>
            Logged the load
            {load.reading?.reader === "gemini" || load.reading?.reader === "claude" ? ` (ticket read by ${load.reading.model ?? load.reading.reader})` : load.reading?.reader === "none" ? " (typed in from the photo)" : ""}
          </div>
        </li>
      </ol>
      <button type="button" className="btn btn-quiet" onClick={onBack}>Back to fields</button>
    </div>
  );
}

function EditForm({ load, onDone }: { load: Load; onDone: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<LoadFields>(() => ({
    ...load.fields,
    date: displayValue("date", load.fields.date),
  }));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function changesFrom(): Partial<LoadFields> {
    const changes: Partial<LoadFields> = {};
    for (const f of FIELDS) {
      const original = f.key === "date" ? displayValue("date", load.fields.date) : load.fields[f.key];
      if (values[f.key] !== original) changes[f.key] = values[f.key];
    }
    return changes;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const changes = changesFrom();
    if (!Object.keys(changes).length) return onDone();
    setSaving(true);
    setFormError(null);
    const res = await fetch(`/api/loads/${load.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes, note: note.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErrors(Object.fromEntries(((data.problems ?? []) as { key: FieldKey; error: string }[]).map((p) => [p.key, p.error])));
      setFormError(data.error ?? "Couldn't save");
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <form className={styles.editForm} onSubmit={save}>
      <div className="section-label">Edit fields</div>
      <div className={styles.editGrid}>
        {FIELDS.filter((f) => f.key !== "comments").map((f) => (
          <label key={f.key} className={styles.editField}>
            <span className={styles.fieldLabel}>{f.label}</span>
            <input
              className="input mono"
              style={{ height: 40, fontSize: 14 }}
              value={values[f.key]}
              aria-invalid={Boolean(errors[f.key])}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.key]: e.target.value }));
                setErrors((x) => ({ ...x, [f.key]: undefined }));
              }}
              onBlur={(e) => {
                // Show fractions as decimals straight away.
                const n = normalizeField(f.key, e.target.value, { gm: values.gm.toUpperCase(), refISO: load.fields.date || isoInZone(new Date()) });
                if (n.ok && f.key !== "date") setValues((v) => ({ ...v, [f.key]: n.value }));
                if (!n.ok) setErrors((x) => ({ ...x, [f.key]: n.error }));
              }}
            />
            {errors[f.key] && <span className="field-error" style={{ fontSize: 12 }}>{errors[f.key]}</span>}
          </label>
        ))}
      </div>
      <label className={styles.editField}>
        <span className={styles.fieldLabel}>Comments</span>
        <textarea className="input" rows={2} value={values.comments} onChange={(e) => setValues((v) => ({ ...v, comments: e.target.value }))} />
      </label>
      <label className={styles.editField}>
        <span className={styles.fieldLabel}>Reason for the change (kept in history)</span>
        <input className="input" style={{ height: 40, fontSize: 14 }} value={note} placeholder="e.g. Checked against ticket photo" onChange={(e) => setNote(e.target.value)} />
      </label>
      {formError && <div className="field-error" role="alert">{formError}</div>}
      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" style={{ flexGrow: 1 }} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="btn btn-quiet" style={{ flexGrow: 1 }} onClick={onDone} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
