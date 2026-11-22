import { parseDates } from "./calendar";

/**
 * Cook County Board of Review "Dates and Deadlines" schedule.
 *
 * Published as a one-page PDF (an Excel export) linked from https://www.cookcountyboardofreview.com/dates-and-deadlines.
 * Townships are filed in numbered hearing GROUPS. The page is laid out with each group as a COLUMN, so every text item's
 * x position says which group it belongs to and its y position says which row (open, close, evidence, hearings, re-review).
 * Exemption columns ("All townships") are skipped: they are not residential assessment complaints.
 *
 * The parser validates what it found and throws rather than returning a partial schedule, so a layout change is noticed.
 */

export interface BorGroup {
  group: number;
  townships: string[];
  /** Complaint filing window. */
  openDate: string;
  closeDate: string;
  evidenceDeadline: string | null;
  hearingDates: string[];
  reReviewOpen: string | null;
  reReviewClose: string | null;
}

export interface BorSchedule {
  year: number;
  groups: BorGroup[];
}

interface Item {
  s: string;
  x: number;
  y: number;
}

const DATE_RE = /\d{1,2}\/\d{1,2}\/\d{4}/;

export async function parseBorSchedule(pdf: Uint8Array): Promise<BorSchedule> {
  // Loaded lazily so the web app never bundles pdf.js; only the sync script and tests use this module.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdf.js takes ownership of the buffer it is given, so hand it a copy and leave the caller's array intact.
  const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const items: Item[] = content.items
    .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i && i.str.trim() !== "")
    .map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));

  const all = items.map((i) => i.s).join(" ");
  const yearMatch = all.match(/(\d{4}) SESSION/);
  if (!yearMatch) throw new Error("BOR schedule: could not find the session year.");
  const year = Number(yearMatch[1]);

  const find = (text: string) => {
    const it = items.find((i) => i.s === text);
    if (!it) throw new Error(`BOR schedule: expected the label "${text}" but it was not found; the layout probably changed.`);
    return it;
  };

  // Row labels (left edge) give the y position of each kind of date.
  const rows = {
    open: find("OPEN FOR").y,
    close: find("CLOSED FOR").y,
    evidence: find("Evidence").y,
    hearings: find("HEARINGS").y,
    reReviewOpen: find("RE-REVIEW OPEN").y,
    reReviewClose: find("RE-REVIEW CLOSED").y,
  } as const;
  type Row = keyof typeof rows;
  const rowOf = (y: number): Row => (Object.keys(rows) as Row[]).reduce((best, r) => (Math.abs(rows[r] - y) < Math.abs(rows[best] - y) ? r : best));

  // Group columns: the single digits sitting just under the "GROUP" header.
  const groupHeader = find("GROUP");
  const groupCols = items
    .filter((i) => /^\d$/.test(i.s) && Math.abs(i.y - groupHeader.y) < 30)
    .map((i) => ({ n: Number(i.s), x: i.x }));
  if (groupCols.length === 0) throw new Error("BOR schedule: no hearing groups found.");
  const groupAt = (x: number) => groupCols.reduce((best, g) => (Math.abs(g.x - x) < Math.abs(best.x - x) ? g : best)).n;

  // Exemption columns: "All townships" sits above their dates; ignore anything in those columns.
  const exemptionXs = items.filter((i) => /^all townships$/i.test(i.s)).map((i) => i.x);
  const inExemptionColumn = (x: number) => exemptionXs.some((ex) => Math.abs(ex - x) < 4);

  const groups = new Map<number, BorGroup & { _open?: string; _close?: string }>();
  for (const g of groupCols) {
    groups.set(g.n, { group: g.n, townships: [], openDate: "", closeDate: "", evidenceDeadline: null, hearingDates: [], reReviewOpen: null, reReviewClose: null });
  }

  // Township names: on the same band as the "TOWNSHIP" header, to its right.
  const townshipHeader = find("TOWNSHIP");
  for (const i of items) {
    if (Math.abs(i.y - townshipHeader.y) > 16 || i.x <= townshipHeader.x + 10) continue;
    if (DATE_RE.test(i.s) || /^\d$/.test(i.s) || /^all townships$/i.test(i.s)) continue;
    groups.get(groupAt(i.x))!.townships.push(i.s);
  }

  for (const i of items) {
    if (!DATE_RE.test(i.s) || inExemptionColumn(i.x)) continue;
    const g = groups.get(groupAt(i.x))!;
    const dates = parseDates(i.s);
    switch (rowOf(i.y)) {
      case "open": g.openDate = dates[0]; break;
      case "close": g.closeDate = dates[0]; break;
      case "evidence": g.evidenceDeadline = dates[0]; break;
      case "hearings": g.hearingDates.push(...dates); break;
      case "reReviewOpen": g.reReviewOpen = dates[0]; break;
      case "reReviewClose": g.reReviewClose = dates[0]; break;
    }
  }

  const result: BorGroup[] = [];
  for (const g of [...groups.values()].sort((a, b) => a.group - b.group)) {
    if (g.townships.length === 0) throw new Error(`BOR schedule: group ${g.group} has no townships.`);
    if (!g.openDate || !g.closeDate) throw new Error(`BOR schedule: group ${g.group} is missing its filing dates.`);
    if (g.openDate > g.closeDate) throw new Error(`BOR schedule: group ${g.group} opens after it closes.`);
    g.hearingDates.sort();
    result.push({
      group: g.group,
      townships: g.townships,
      openDate: g.openDate,
      closeDate: g.closeDate,
      evidenceDeadline: g.evidenceDeadline,
      hearingDates: g.hearingDates,
      reReviewOpen: g.reReviewOpen,
      reReviewClose: g.reReviewClose,
    });
  }
  return { year, groups: result };
}

/** Find the schedule PDF link on the Board of Review's dates page (its path changes with the upload month). */
export function findScheduleLink(html: string, base = "https://www.cookcountyboardofreview.com"): string | null {
  const re = /<a[^>]+href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (/township and exemption dates/i.test(text) || /township.?open.?close/i.test(m[1])) return new URL(m[1].replace(/&amp;/g, "&"), base).toString();
  }
  return null;
}
