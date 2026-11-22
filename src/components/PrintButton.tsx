"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn small no-print" onClick={() => window.print()}>
      Print this checklist
    </button>
  );
}
