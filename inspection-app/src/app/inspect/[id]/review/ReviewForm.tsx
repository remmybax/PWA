"use client";

import { useActionState, useState } from "react";
import type { Overall } from "@/lib/types";
import { LockIcon } from "@/components/icons";

const OPTIONS: { value: Overall; label: string; help: string }[] = [
  { value: "in_service", label: "In service", help: "Nothing failed. Good to run." },
  { value: "needs_repair", label: "Needs repair", help: "Can run, but the defects need fixing soon." },
  { value: "out_of_service", label: "Out of service", help: "Don't run it until the shop fixes it." },
];

export function ReviewForm({
  action,
  id,
  ready,
  hasDefects,
  suggested,
  comments,
  name,
}: {
  action: (prev: { error: string } | null, form: FormData) => Promise<{ error: string } | null>;
  id: string;
  ready: boolean;
  hasDefects: boolean;
  suggested: Overall;
  comments: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [overall, setOverall] = useState<Overall>(suggested);
  const [signature, setSignature] = useState("");

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="overall" value={overall} />

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 className="section-label">Truck status</h2>
        <div className="rows" role="radiogroup" aria-label="Truck status">
          {OPTIONS.map((o) => {
            const blocked = o.value === "in_service" && hasDefects;
            return (
              <label key={o.value} className="row-link" style={{ cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.5 : 1 }}>
                <input
                  type="radio"
                  name="overall-pick"
                  checked={overall === o.value}
                  disabled={blocked}
                  onChange={() => setOverall(o.value)}
                  style={{ width: 22, height: 22, accentColor: "var(--navy)" }}
                />
                <span className="row-main">
                  <span className="row-title">{o.label}</span>
                  <span className="row-sub">{blocked ? "Not available: items failed." : o.help}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="section-label">Comments</span>
        <textarea name="comments" className="input" rows={3} defaultValue={comments} placeholder="Anything the shop or the office should know" maxLength={2000} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="section-label">Sign</span>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>
          Type your full name to certify you inspected this truck in person today.
        </span>
        <input name="signature" className="input" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={name} autoComplete="name" />
      </label>

      {state?.error && (
        <div className="note-warn" role="alert">
          {state.error}
        </div>
      )}

      <button className="btn btn-orange btn-big" disabled={!ready || pending || signature.trim().length < 2}>
        <LockIcon /> {pending ? "Signing…" : "Sign and lock inspection"}
      </button>
      {!ready && <p className="lead" style={{ fontSize: 13 }}>Finish the items above first.</p>}
      <p className="lead" style={{ fontSize: 13 }}>
        Once signed, the inspection can&apos;t be changed. You&apos;ll get the QR label and the printable report next.
      </p>
    </form>
  );
}
