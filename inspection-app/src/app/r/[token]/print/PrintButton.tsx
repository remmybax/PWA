"use client";

import { PrintIcon } from "@/components/icons";

export function PrintButton() {
  return (
    <button className="btn btn-primary" onClick={() => window.print()}>
      <PrintIcon /> Print / save as PDF
    </button>
  );
}
