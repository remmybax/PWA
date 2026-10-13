import { FIELDS } from "@/lib/fields";
import { displayValue, fitClass, sheetColumns } from "@/lib/format";
import type { Load } from "@/lib/types";

const COLUMNS = sheetColumns(FIELDS);

/** The weekly paper sheet: 18 columns, headings exactly as printed. */
export default function SheetTable({ loads, highlightId, fill = 0 }: { loads: Load[]; highlightId?: string; fill?: number }) {
  const blanks = Math.max(0, fill - loads.length);
  return (
    <div className="sheet" role="table" aria-label="Weekly log sheet" style={{ "--sheet-cols": COLUMNS } as React.CSSProperties}>
      <div className="sheet-head" role="row">
        {FIELDS.map((f) => (
          <div key={f.key} role="columnheader">{f.sheetLabel}</div>
        ))}
      </div>
      {loads.map((l) => (
        <div key={l.id} role="row" className={`sheet-row${l.id === highlightId ? " is-new" : ""}`}>
          {FIELDS.map((f) => {
            const text = displayValue(f.key, l.fields[f.key]);
            const cls = [f.key === "comments" ? "comment" : "", fitClass(text, f.width)].filter(Boolean).join(" ");
            return (
              <div key={f.key} role="cell" className={cls || undefined} title={f.key === "comments" ? l.fields.comments : undefined}>
                {text}
              </div>
            );
          })}
        </div>
      ))}
      {Array.from({ length: blanks }, (_, i) => (
        <div key={`blank-${i}`} role="row" className="sheet-row" aria-hidden="true">
          {FIELDS.map((f) => <div key={f.key} />)}
        </div>
      ))}
      {loads.length === 0 && fill === 0 && <div className="sheet-empty">No loads logged this week.</div>}
    </div>
  );
}
