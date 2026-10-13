"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ALWAYS_CHECK, FIELD_BY_KEY, TICKET_FIELDS, emptyFields, type FieldKey, type LoadFields } from "@/lib/fields";
import { displayValue, normalizeField } from "@/lib/format";
import { nothingWasRead, type TicketReading } from "@/lib/types";
import { ArrowRight, CheckIcon, ChevronLeft, CloseIcon, WarnIcon } from "@/components/icons";
import styles from "./scan.module.css";

interface Props {
  photoUrl: string;
  photoKey: string;
  reading: TicketReading;
  lastStation: string;
  todayISO: string;
  onRetake: () => void;
}

type Errors = Partial<Record<FieldKey, string>>;

export function fieldLabel(key: FieldKey, gm: string): string {
  if (gm === "M" && key === "topGauge") return "Top meter";
  if (gm === "M" && key === "bottomGauge") return "B meter";
  return FIELD_BY_KEY[key].label;
}

export function inputModeFor(key: FieldKey): React.HTMLAttributes<HTMLInputElement>["inputMode"] {
  const kind = FIELD_BY_KEY[key].kind;
  if (kind === "temp" || kind === "decimal") return "decimal";
  if (kind === "digits") return "numeric";
  return "text";
}

export function placeholderFor(key: FieldKey, gm: string): string {
  const kind = FIELD_BY_KEY[key].kind;
  if (kind === "gauge") return gm === "M" ? "20418.6" : `14' 3.5"`;
  if (kind === "date") return "MM/DD";
  return "";
}

/** Value shown in an input: dates as MM/DD, everything else as stored. */
function editable(key: FieldKey, v: string): string {
  return key === "date" && v ? displayValue("date", v) : v;
}

export default function Review({ photoUrl, photoKey, reading, lastStation, todayISO, onRetake }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<LoadFields>(() => ({
    ...emptyFields(),
    ...reading.values,
    // Typing it in: start with today's date and a gauge load, the usual case.
    ...(nothingWasRead(reading) ? { date: todayISO, gm: "G" } : {}),
    // Reject and its reason come from the ticket's Rejected line when it was read; the driver can change them.
    reject: reading.values.reject || "N",
    comments: reading.values.comments ?? "",
    // Read from the ticket (station number, or the receiver when there is none); else the last one used.
    station: reading.values.station || lastStation,
    waitTime: "0",
  }));
  // Text in the inputs, so partial typing ("14' 3") isn't rewritten mid-keystroke.
  const [drafts, setDrafts] = useState<Partial<Record<FieldKey, string>>>(() =>
    nothingWasRead(reading)
      ? { date: editable("date", todayISO), gm: "G" }
      : Object.fromEntries(reading.flagged.map((k) => [k, editable(k, reading.values[k] ?? "")])),
  );
  const [confirmed, setConfirmed] = useState<Set<FieldKey>>(new Set());
  const [fixing, setFixing] = useState<Set<FieldKey>>(new Set());
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const gm = values.gm;
  const flagged = reading.flagged;
  // Nothing was read (no reader set up, or it failed): the driver types the ticket in.
  const typing = nothingWasRead(reading);
  const readFields = TICKET_FIELDS.filter((f) => !flagged.includes(f.key));
  // Ticket #, Top gauge and B Gauge get a tick box on every load (see ALWAYS_CHECK).
  const ticks = ALWAYS_CHECK.filter((k) => !flagged.includes(k));
  const outstanding = typing ? [] : [...flagged, ...ticks].filter((k) => !confirmed.has(k));

  const commit = (key: FieldKey, text: string) => {
    const n = normalizeField(key, text, { gm: key === "gm" ? "" : gm, refISO: todayISO });
    setValues((v) => ({ ...v, [key]: n.value }));
    setErrors((e) => ({ ...e, [key]: n.ok ? undefined : n.error }));
    if (n.ok) setDrafts((d) => ({ ...d, [key]: editable(key, n.value) }));
  };

  const setDraft = (key: FieldKey, text: string) => {
    setDrafts((d) => ({ ...d, [key]: text }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const toggleConfirmed = (key: FieldKey, on: boolean) =>
    setConfirmed((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const startFix = (key: FieldKey) => {
    setDrafts((d) => ({ ...d, [key]: editable(key, values[key]) }));
    setFixing((s) => new Set(s).add(key));
  };

  const firstProblem = () => {
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector<HTMLElement>("[data-problem='true']");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
  };

  async function logLoad() {
    setFormError(null);
    // Take whatever is in open inputs.
    const merged = { ...values };
    const localErrors: Errors = {};
    for (const [k, text] of Object.entries(drafts) as [FieldKey, string][]) {
      const n = normalizeField(k, text, { gm: k === "gm" ? "" : merged.gm, refISO: todayISO });
      merged[k] = n.value;
      if (!n.ok) localErrors[k] = n.error;
    }
    for (const k of outstanding) localErrors[k] ??= "Check this against the ticket";
    setValues(merged);
    if (Object.values(localErrors).some(Boolean)) {
      setErrors(localErrors);
      firstProblem();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/loads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Typed in from the photo: the driver vouches for every field by logging it.
        body: JSON.stringify({ photoKey, fields: merged, confirmed: typing ? flagged : [...confirmed] }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/signin");
        return;
      }
      if (!res.ok) {
        const serverErrors: Errors = {};
        for (const p of (data.problems ?? []) as { key: FieldKey; error: string }[]) {
          serverErrors[p.key] = p.error;
          if (FIELD_BY_KEY[p.key].source === "ticket" && !flagged.includes(p.key)) {
            setFixing((s) => new Set(s).add(p.key));
            setDrafts((d) => ({ ...d, [p.key]: editable(p.key, merged[p.key]) }));
          }
        }
        setErrors(serverErrors);
        setFormError(data.error ?? "Couldn't log this load");
        firstProblem();
        setSaving(false);
        return;
      }
      // A full page load, not a client-side transition: on a weak phone connection a soft
      // navigation can hang after the load is already saved, leaving the driver on "Logging…".
      window.location.assign(`/my-log?new=${data.id}`);
    } catch {
      setFormError(navigator.onLine ? "Couldn't reach the server. Try again." : "No signal. Stay on this screen and try again when you have service.");
      setSaving(false);
    }
  }

  const total = TICKET_FIELDS.length;

  return (
    <main className="phone" ref={rootRef}>
      <header className="appbar" style={{ padding: "10px 16px 10px 4px" }}>
        <button type="button" className={styles.back} onClick={onRetake}>
          <ChevronLeft /> Retake
        </button>
        <img src="/indeca-logo.png" alt="Indeca Crude Xpress" style={{ height: 32 }} />
      </header>

      <div className={styles.reviewBody}>
        <div className={styles.summary}>
          <button type="button" className={styles.thumb} onClick={() => setShowPhoto(true)} aria-label="View ticket photo">
            <img src={photoUrl} alt="" />
          </button>
          <div className={styles.summaryText}>
            <h1 className="heading" style={{ fontSize: 24 }}>{typing ? "Type in ticket" : "Check ticket"}</h1>
            {typing ? (
              <div className={styles.readCount} style={{ fontSize: 14, fontWeight: 500 }}>
                Copy the fields from the printed ticket. Tap the photo to zoom in.
              </div>
            ) : (
              <div className={styles.readCount}>
                {total - flagged.length} of {total} fields read
              </div>
            )}
            {typing ? null : outstanding.length > 0 ? (
              <div className={styles.needs}>
                <WarnIcon size={16} />
                {outstanding.length === 1 ? "1 field needs you before logging" : `${outstanding.length} fields need you before logging`}
              </div>
            ) : (
              <div className={styles.allGood}>
                <CheckIcon size={16} /> Ready to log
              </div>
            )}
            {reading.notes && <div className={styles.readerNote}>{reading.notes}</div>}
          </div>
        </div>

        {typing && (
          <section className={styles.card}>
            <div className="section-label" style={{ padding: "12px 16px 4px" }}>From the ticket</div>
            {TICKET_FIELDS.map((f) => {
              const key = f.key;
              const id = `type-${key}`;
              if (key === "gm") {
                return (
                  <div key={key} className={styles.fixRow} style={{ background: "#fff" }} data-problem={Boolean(errors.gm)}>
                    <div className={styles.rowLabel} id="gm-label">G/M</div>
                    <div className={styles.segment} role="radiogroup" aria-labelledby="gm-label">
                      {(["G", "M"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={values.gm === v}
                          className={values.gm === v ? styles.segOn : styles.segOff}
                          onClick={() => {
                            setValues((s) => ({ ...s, gm: v }));
                            setDrafts((d) => ({ ...d, gm: v }));
                            setErrors((e) => ({ ...e, gm: undefined }));
                          }}
                        >
                          {v === "G" ? "Gauge" : "Meter"}
                        </button>
                      ))}
                    </div>
                    {errors.gm && <div className="field-error">{errors.gm}</div>}
                  </div>
                );
              }
              if (gm === "M" && f.gaugeOnly) return null;
              return (
                <div key={key} className={styles.fixRow} style={{ background: "#fff" }} data-problem={Boolean(errors[key])}>
                  <label htmlFor={id} className={styles.rowLabel}>{fieldLabel(key, gm)}</label>
                  <input
                    id={id}
                    className="input mono"
                    value={drafts[key] ?? ""}
                    inputMode={inputModeFor(key)}
                    placeholder={placeholderFor(key, gm)}
                    autoComplete="off"
                    aria-invalid={Boolean(errors[key])}
                    onChange={(e) => setDraft(key, e.target.value)}
                    onBlur={(e) => commit(key, e.target.value)}
                  />
                  {errors[key] && <div className="field-error">{errors[key]}</div>}
                </div>
              );
            })}
          </section>
        )}

        {!typing && flagged.map((key) => {
          const id = `flag-${key}`;
          const blank = !(reading.values[key] ?? "");
          return (
            <div key={key} className={styles.flag} data-problem={Boolean(errors[key])}>
              <label htmlFor={id} className={styles.flagTitle}>
                {fieldLabel(key, gm)} — {blank ? "couldn't read it" : "couldn't read clearly"}
              </label>
              <div className={styles.flagHelp}>
                {blank ? "Type it in from the printed ticket." : "Check the printed ticket and correct this if it's wrong."}
              </div>
              <input
                id={id}
                className={`input mono ${styles.flagInput}`}
                value={drafts[key] ?? ""}
                inputMode={inputModeFor(key)}
                placeholder={placeholderFor(key, gm)}
                autoComplete="off"
                aria-invalid={Boolean(errors[key])}
                aria-describedby={errors[key] ? `${id}-err` : undefined}
                onChange={(e) => {
                  setDraft(key, e.target.value);
                  toggleConfirmed(key, e.target.value.trim() !== "");
                }}
                onBlur={(e) => commit(key, e.target.value)}
              />
              {errors[key] && <div id={`${id}-err`} className="field-error">{errors[key]}</div>}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={confirmed.has(key)}
                  onChange={(e) => toggleConfirmed(key, e.target.checked)}
                />
                Matches the ticket
              </label>
            </div>
          );
        })}

        {!typing && (
        <section className={styles.card}>
          <div className="section-label" style={{ padding: "12px 16px 4px" }}>Read from ticket</div>
          {readFields.map((f) => {
            const key = f.key;
            const notApplicable = gm === "M" && f.gaugeOnly;
            if (fixing.has(key)) {
              const id = `fix-${key}`;
              return (
                <div key={key} className={styles.fixRow} data-problem={Boolean(errors[key])}>
                  <label htmlFor={id} className={styles.rowLabel}>{fieldLabel(key, gm)}</label>
                  <input
                    id={id}
                    className="input mono"
                    value={drafts[key] ?? ""}
                    inputMode={inputModeFor(key)}
                    placeholder={placeholderFor(key, gm)}
                    autoComplete="off"
                    autoFocus
                    aria-invalid={Boolean(errors[key])}
                    onChange={(e) => {
                      setDraft(key, e.target.value);
                      // Correcting it from the paper counts as checking it.
                      if (ticks.includes(key)) toggleConfirmed(key, true);
                    }}
                    onBlur={(e) => commit(key, e.target.value)}
                  />
                  {errors[key] && <div className="field-error">{errors[key]}</div>}
                </div>
              );
            }
            if (ticks.includes(key)) {
              const id = `tick-${key}`;
              return (
                <div key={key} className={`${styles.readRow} ${styles.tickRow}`} data-problem={Boolean(errors[key])}>
                  <label htmlFor={id} className={styles.tickLabel}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={confirmed.has(key)}
                      onChange={(e) => {
                        toggleConfirmed(key, e.target.checked);
                        setErrors((x) => ({ ...x, [key]: undefined }));
                      }}
                    />
                    <span className={styles.rowLabel}>{fieldLabel(key, gm)}</span>
                  </label>
                  <button
                    type="button"
                    className={styles.tickValue}
                    onClick={() => startFix(key)}
                    aria-label={`${fieldLabel(key, gm)}: ${displayValue(key, values[key])}. Tap to correct.`}
                  >
                    <span className="mono">{displayValue(key, values[key])}</span>
                  </button>
                </div>
              );
            }
            return (
              <button
                key={key}
                type="button"
                className={styles.readRow}
                onClick={() => !notApplicable && startFix(key)}
                disabled={notApplicable}
                aria-label={`${fieldLabel(key, gm)}: ${displayValue(key, values[key])}. Tap to correct.`}
              >
                <span className={styles.rowLabel}>{fieldLabel(key, gm)}</span>
                <span className={styles.rowValue}>
                  <span className="mono">{displayValue(key, values[key])}</span>
                  {!notApplicable && <CheckIcon size={16} color="#2F6B3A" />}
                </span>
              </button>
            );
          })}
          <div className={styles.tapHint}>Tick the boxed lines once you&apos;ve checked them against the paper. Wrong? Tap a line to correct it.</div>
        </section>
        )}

        <section className={`${styles.card} ${styles.youAdd}`}>
          <div className="section-label">You add</div>
          <div className={styles.stack}>
            <div className="field-label" id="reject-label">Reject</div>
            <div className={styles.segment} role="radiogroup" aria-labelledby="reject-label">
              {(["N", "Y"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={values.reject === v}
                  className={values.reject === v ? styles.segOn : styles.segOff}
                  onClick={() => setValues((s) => ({ ...s, reject: v }))}
                >
                  {v === "N" ? "No" : "Yes"}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.twoCol}>
            <div className={styles.stack} data-problem={Boolean(errors.station)}>
              <label htmlFor="station" className="field-label">Station #</label>
              <input
                id="station"
                className="input mono"
                value={values.station}
                placeholder="or receiver, e.g. P66"
                autoComplete="off"
                aria-invalid={Boolean(errors.station)}
                onChange={(e) => {
                  setValues((s) => ({ ...s, station: e.target.value }));
                  setErrors((x) => ({ ...x, station: undefined }));
                }}
              />
              {errors.station && <div className="field-error">Put the station # or the receiver</div>}
            </div>
            <div className={styles.stack} data-problem={Boolean(errors.waitTime)}>
              <label htmlFor="wait" className="field-label">Wait time (hrs)</label>
              <input
                id="wait"
                className="input mono"
                inputMode="decimal"
                value={drafts.waitTime ?? values.waitTime}
                autoComplete="off"
                aria-invalid={Boolean(errors.waitTime)}
                onChange={(e) => setDraft("waitTime", e.target.value)}
                onBlur={(e) => commit("waitTime", e.target.value)}
              />
              {errors.waitTime && <div className="field-error">{errors.waitTime}</div>}
            </div>
          </div>
          <div className={styles.stack}>
            <label htmlFor="comments" className="field-label">Comments</label>
            <textarea
              id="comments"
              rows={2}
              placeholder="Optional"
              className="input"
              value={values.comments}
              onChange={(e) => setValues((s) => ({ ...s, comments: e.target.value }))}
            />
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        {formError && <div className="field-error" role="alert" style={{ marginBottom: 10 }}>{formError}</div>}
        <button type="button" className="btn btn-orange btn-big" onClick={logLoad} disabled={saving}>
          {saving ? "Logging…" : "Log this load"} {!saving && <ArrowRight size={20} />}
        </button>
      </footer>

      {showPhoto && (
        <div className={styles.photoViewer} role="dialog" aria-label="Ticket photo">
          <button type="button" className={styles.photoClose} onClick={() => setShowPhoto(false)} aria-label="Close photo">
            <CloseIcon size={24} />
          </button>
          <img src={photoUrl} alt="Ticket photo" />
        </div>
      )}
    </main>
  );
}
