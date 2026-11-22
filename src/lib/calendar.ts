import * as cheerio from "cheerio";

export interface CalendarEntry {
  year: number;
  region: string;
  township: string;
  noticeDate: string | null; // ISO yyyy-mm-dd
  lastFileDate: string | null;
  aRollCertified: string | null;
  aRollPublished: string | null;
  borStart: string | null;
  borEnd: string | null;
  pass: number | null;
  statusText: string;
}

export type AppealStage = "not_scheduled" | "upcoming" | "assessor_open" | "between" | "bor_open" | "closed";

const DATE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;

function toIso(m: RegExpMatchArray | RegExpExecArray): string {
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function parseDates(text: string): string[] {
  return [...text.matchAll(DATE)].map(toIso);
}

/**
 * Parse https://www.cookcountyassessoril.gov/assessment-calendar-and-deadlines.
 * The page lists current-year "calendar sets" (e.g. "2026 Assessment Calendar: South & West Suburban Cook County"),
 * each containing one `.views-row` per township. Older years are only linked, not listed.
 */
export function parseCalendar(html: string): CalendarEntry[] {
  const $ = cheerio.load(html);
  const entries: CalendarEntry[] = [];

  $(".paragraph--type--assessment-calendar-set").each((_, set) => {
    const id = $(set).attr("id");
    const idx = id ? html.indexOf(`id="${id}"`) : -1;
    const before = idx > 0 ? html.slice(Math.max(0, idx - 4000), idx) : "";
    // Tags become line breaks (so a heading never runs into the paragraph after it); text() decodes &amp; etc.
    const beforeText = cheerio.load(`<div>${before.replace(/<[^>]+>/g, "\n")}</div>`)("div").text();
    const labels = [...beforeText.matchAll(/(\d{4}) Assessment Calendar:[ \t]*([^\n]+)/g)];
    const label = labels.at(-1);
    const year = label ? Number(label[1]) : NaN;
    const region = label ? label[2].trim() : "Unknown";
    if (!Number.isFinite(year)) return;

    $(set)
      .find(".views-row")
      .each((__, row) => {
        const $row = $(row);
        const township = $row.find(".views-field-title a").first().text().trim();
        if (!township) return;
        const statusText = $row.find(".open-appeal, .appeal-options").first().text().trim().replace(/\s+/g, " ");

        const fields = new Map<string, string>();
        $row.find(".copy .col-md-2").each((___, col) => {
          const label = $(col).find(".label-a").text().replace(/\s+/g, " ").trim();
          const value = $(col).find("span.row").not(".label-a").text().replace(/\s+/g, " ").trim();
          if (label) fields.set(label, value);
        });

        const one = (k: string) => parseDates(fields.get(k) ?? "")[0] ?? null;
        // The label is "Board of Review Appeal Dates" when filled but "Last File Date Board of Review Appeal Dates" when empty.
        const borKey = [...fields.keys()].find((k) => k.includes("Board of Review"));
        const bor = parseDates(borKey ? (fields.get(borKey) ?? "") : "");
        const pass = Number.parseInt(fields.get("Pass") ?? "", 10);

        entries.push({
          year,
          region,
          township,
          noticeDate: one("Reassessment Notice Date"),
          lastFileDate: one("Last File Date"),
          aRollCertified: one("Date A-Roll Certified"),
          aRollPublished: one("Date A-Roll Published"),
          borStart: bor[0] ?? null,
          borEnd: bor[1] ?? null,
          pass: Number.isFinite(pass) ? pass : null,
          statusText,
        });
      });
  });
  return entries;
}

/** Where a township is in the appeal cycle on `today` (ISO date). Dates compare as ISO strings. */
export function appealStage(e: CalendarEntry, today: string): AppealStage {
  if (!e.noticeDate && !e.lastFileDate) return "not_scheduled";
  if (e.noticeDate && today < e.noticeDate) return "upcoming";
  if (e.lastFileDate && today <= e.lastFileDate) return "assessor_open";
  if (e.borStart && e.borEnd && today >= e.borStart && today <= e.borEnd) return "bor_open";
  if (e.borStart && today < e.borStart) return "between";
  if (!e.borStart && e.lastFileDate && today > e.lastFileDate) return "between"; // BOR dates not published yet
  return "closed";
}
