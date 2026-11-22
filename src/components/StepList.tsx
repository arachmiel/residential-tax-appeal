"use client";

import { useState, useSyncExternalStore } from "react";
import type { Step } from "@/lib/filing";
import { CopyButton } from "./CopyButton";

const noopSubscribe = () => () => {};

/** Reads the saved ticks without an effect: the server render sees "", the browser sees localStorage. */
function useSavedChecks(storageKey: string): Record<string, boolean> {
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(storageKey) ?? "";
      } catch {
        return ""; // private mode or blocked storage: the checklist still works, it just isn't remembered
      }
    },
    () => "",
  );
  try {
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** The checklist. Which steps are ticked is remembered in this browser only (localStorage); nothing is sent to a server. */
export function StepList({ steps, storageKey }: { steps: Step[]; storageKey: string }) {
  const saved = useSavedChecks(storageKey);
  const [edited, setEdited] = useState<Record<string, boolean> | null>(null); // in-memory copy once the user ticks something
  const done = edited ?? saved;

  function toggle(id: string) {
    const next = { ...done, [id]: !done[id] };
    setEdited(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const finished = steps.filter((s) => done[s.id]).length;

  return (
    <>
      <p className="meta no-print" aria-live="polite">{finished} of {steps.length} steps done</p>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.id} className={done[s.id] ? "step done" : "step"}>
            <label className="step-head">
              <input type="checkbox" checked={!!done[s.id]} onChange={() => toggle(s.id)} />
              <span><span className="step-n">{i + 1}.</span> {s.title}</span>
            </label>
            <div className="step-body">
              {s.body.map((b) => <p key={b}>{b}</p>)}
              {s.link && (
                <p>
                  <a className="btn link" href={s.link.href} target="_blank" rel="noopener noreferrer">{s.link.label} ↗</a>
                </p>
              )}
              {s.copy && s.copy.length > 0 && (
                <ul className="copy-list">
                  {s.copy.map((c) => (
                    <li key={c.label}>
                      <span className="copy-label">{c.label}</span>
                      <code>{c.value}</code>
                      <CopyButton value={c.value} />
                    </li>
                  ))}
                </ul>
              )}
              {s.copy && s.copy.length > 1 && s.id === "comps" && (
                <p className="no-print"><CopyButton value={s.copy.map((c) => c.value).join("\n")} label="Copy all PINs" /></p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
