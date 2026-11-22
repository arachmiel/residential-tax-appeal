import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appealStage, parseCalendar, parseDates, type CalendarEntry } from "@/lib/calendar";

const html = readFileSync(new URL("./fixtures/assessor-calendar.html", import.meta.url), "utf8");

describe("parseCalendar (real page snapshot, 2026-11-22)", () => {
  const entries = parseCalendar(html);
  const find = (t: string) => entries.find((e) => e.township === t)!;

  it("finds all 38 townships", () => {
    expect(entries).toHaveLength(38);
    expect(new Set(entries.map((e) => e.township)).size).toBe(38);
  });

  it("labels the region and year of each calendar set", () => {
    expect(find("Thornton").year).toBe(2026);
    expect(find("Thornton").region).toMatch(/South & West/);
    expect(find("Niles").region).toMatch(/North Suburbs/);
  });

  it("parses an open township", () => {
    const t = find("Thornton");
    expect(t.noticeDate).toBe("2026-10-08");
    expect(t.lastFileDate).toBe("2026-11-23");
    expect(t.borStart).toBeNull();
    expect(t.statusText).toMatch(/Open For Appeals/);
  });

  it("parses Board of Review date ranges", () => {
    const rf = find("River Forest");
    expect(rf.aRollCertified).toBe("2026-06-23");
    expect(rf.borStart).toBe("2026-08-03");
    expect(rf.borEnd).toBe("2026-09-01");
    expect(rf.pass).toBe(2);
  });
});

describe("appealStage", () => {
  const e = (o: Partial<CalendarEntry>): CalendarEntry => ({
    year: 2026, region: "x", township: "T", noticeDate: null, lastFileDate: null, aRollCertified: null,
    aRollPublished: null, borStart: null, borEnd: null, pass: null, statusText: "", ...o,
  });
  const full = e({ noticeDate: "2026-04-20", lastFileDate: "2026-06-02", borStart: "2026-08-03", borEnd: "2026-09-01" });

  it("walks through the cycle", () => {
    expect(appealStage(e({}), "2026-05-01")).toBe("not_scheduled");
    expect(appealStage(full, "2026-04-01")).toBe("upcoming");
    expect(appealStage(full, "2026-04-20")).toBe("assessor_open");
    expect(appealStage(full, "2026-06-02")).toBe("assessor_open"); // last file date is inclusive
    expect(appealStage(full, "2026-07-01")).toBe("between");
    expect(appealStage(full, "2026-08-03")).toBe("bor_open");
    expect(appealStage(full, "2026-09-02")).toBe("closed");
  });

  it("says 'between' while Board of Review dates aren't published", () => {
    expect(appealStage(e({ noticeDate: "2026-09-14", lastFileDate: "2026-10-27" }), "2026-11-22")).toBe("between");
  });
});

it("parseDates", () => expect(parseDates("8/3/2026 - 9/1/2026")).toEqual(["2026-08-03", "2026-09-01"]));
