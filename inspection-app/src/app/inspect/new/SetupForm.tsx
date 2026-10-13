"use client";

import { useActionState, useState } from "react";
import { ArrowRight } from "@/components/icons";

interface TruckOption {
  id: string;
  unit: string;
  label: string;
  defaultTrailerId: string | null;
  due: string;
}

const DUE_TEXT: Record<string, string> = { overdue: " (overdue)", soon: " (due soon)", never: " (never inspected)", ok: "" };

export function SetupForm({
  action,
  trucks,
  trailers,
  preselect,
}: {
  action: (prev: { error: string } | null, form: FormData) => Promise<{ error: string } | null>;
  trucks: TruckOption[];
  trailers: { id: string; label: string }[];
  preselect: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const first = trucks.find((t) => t.id === preselect) ?? null;
  const [truckId, setTruckId] = useState(first?.id ?? "");
  const [trailerId, setTrailerId] = useState(first?.defaultTrailerId ?? "");

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="field-label">Truck</span>
        <select
          name="truckId"
          className="input"
          required
          value={truckId}
          onChange={(e) => {
            setTruckId(e.target.value);
            setTrailerId(trucks.find((t) => t.id === e.target.value)?.defaultTrailerId ?? "");
          }}
        >
          <option value="" disabled>
            Pick a truck
          </option>
          {trucks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {DUE_TEXT[t.due]}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="field-label">Trailer</span>
        <select name="trailerId" className="input" value={trailerId} onChange={(e) => setTrailerId(e.target.value)}>
          <option value="">No trailer (bobtail)</option>
          {trailers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>With no trailer, the trailer and tank items are skipped.</span>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="field-label">Where are you?</span>
        <input name="location" className="input" placeholder="Odessa yard" maxLength={80} />
      </label>
      {state?.error && (
        <div className="field-error" role="alert">
          {state.error}
        </div>
      )}
      <button className="btn btn-orange btn-big" disabled={pending || !truckId}>
        {pending ? "Starting…" : "Start inspection"} <ArrowRight />
      </button>
      <p className="lead" style={{ fontSize: 13 }}>
        Not on the list? Ask a manager to add it under Fleet.
      </p>
    </form>
  );
}
