import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findScheduleLink, parseBorSchedule } from "@/lib/bor";
import { appealStage, type CalendarEntry } from "@/lib/calendar";

const pdf = new Uint8Array(readFileSync(new URL("./fixtures/bor-township-dates.pdf", import.meta.url)));

describe("parseBorSchedule (real PDF, regenerated 2026-11-20)", () => {
  it("reads the session year and all four hearing groups", async () => {
    const s = await parseBorSchedule(pdf);
    expect(s.year).toBe(2026);
    expect(s.groups.map((g) => g.group)).toEqual([1, 2, 3, 4]);
    expect(s.groups.flatMap((g) => g.townships)).toHaveLength(22);
  });

  it("puts each township in the right group", async () => {
    const { groups } = await parseBorSchedule(pdf);
    const g = (n: number) => groups.find((x) => x.group === n)!;
    expect([...g(1).townships].sort()).toEqual(["Evanston", "New Trier", "Norwood Park", "Oak Park", "River Forest", "Riverside", "Rogers Park"]);
    expect([...g(2).townships].sort()).toEqual(["Berwyn", "Cicero", "Elk Grove", "Lakeview", "Maine", "Palos"]);
    expect([...g(3).townships].sort()).toEqual(["Lyons", "Northfield", "Stickney", "West Chicago"]);
    expect([...g(4).townships].sort()).toEqual(["Barrington", "Bremen", "Calumet", "Hyde Park", "Lemont"]);
  });

  it("reads the filing windows (and ignores the exemption columns)", async () => {
    const { groups } = await parseBorSchedule(pdf);
    const win = (n: number) => { const g = groups.find((x) => x.group === n)!; return [g.openDate, g.closeDate]; };
    expect(win(1)).toEqual(["2026-08-03", "2026-09-01"]);
    expect(win(2)).toEqual(["2026-08-31", "2026-09-29"]); // Maine
    expect(win(3)).toEqual(["2026-10-08", "2026-11-06"]);
    expect(win(4)).toEqual(["2026-11-09", "2026-12-08"]);
  });

  it("reads evidence deadlines, hearings and re-review", async () => {
    const { groups } = await parseBorSchedule(pdf);
    const g = (n: number) => groups.find((x) => x.group === n)!;
    expect(g(1).evidenceDeadline).toBe("2026-09-11");
    expect(g(2).evidenceDeadline).toBe("2026-10-09");
    expect(g(4).evidenceDeadline).toBe("2026-12-18");
    expect(g(2).hearingDates).toContain("2026-11-02");
    expect(g(2).hearingDates).toContain("2026-11-05");
    expect(g(1).reReviewOpen).toBe("2026-10-26");
    expect(g(1).reReviewClose).toBe("2026-10-28");
    expect(g(4).reReviewOpen).toBeNull();
  });

  it("rejects a file that isn't the schedule", async () => {
    const other = new Uint8Array(readFileSync(new URL("./fixtures/bor-township-dates.pdf", import.meta.url)).subarray(0, 200));
    await expect(parseBorSchedule(other)).rejects.toThrow();
  });
});

describe("findScheduleLink", () => {
  it("finds the schedule PDF on the real dates page", () => {
    const html = readFileSync(new URL("./fixtures/bor-dates-page.html", import.meta.url), "utf8");
    expect(findScheduleLink(html)).toMatch(/^https:\/\/www\.cookcountyboardofreview\.com\/.*2026TOWNSHIPOPEN-CLOSE\.pdf$/);
  });
  it("returns null when there is no schedule link", () => {
    expect(findScheduleLink("<a href='/x.pdf'>Something else</a>")).toBeNull();
  });
});

describe("appealStage with Board of Review dates", () => {
  const base: CalendarEntry = {
    year: 2026, region: "x", township: "Hyde Park", noticeDate: "2026-09-01", lastFileDate: "2026-10-15", aRollCertified: null,
    aRollPublished: null, borStart: null, borEnd: null, pass: null, statusText: "",
  };
  it("a township whose BOR window is open today is bor_open even though the Assessor page lists no BOR dates", () => {
    expect(appealStage({ ...base, borStart: "2026-11-09", borEnd: "2026-12-08" }, "2026-11-22")).toBe("bor_open");
  });
  it("without BOR dates the same township is only 'between'", () => {
    expect(appealStage(base, "2026-11-22")).toBe("between");
  });
});
