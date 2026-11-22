import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "@/lib/calendar";
import { findComps, type Property } from "@/lib/comps";
import { BOR_NOTES_COMPS, buildFilingPlan, daysBetween, describeDaysLeft, LINKS, type FilingPlan } from "@/lib/filing";

let n = 0;
const prop = (o: Partial<Property> = {}): Property => ({
  pin: String(20000000000000 + ++n), address: `${n} OAK ST`, townshipCode: "22", nbhd: "100", propClass: "203", extWall: "Masonry",
  yearBuilt: 1960, bldgSf: 1500, landSf: 6000, bldgValue: 30000, isMultiCard: false, isMultiLand: false, prorationRate: 1,
  lat: 41.9, lon: -87.8, bsmt: "Full", bsmtFin: "Unfinished", garAtt: "No", garSize: "2 cars", ...o,
});
const subject = prop({ pin: "99999999999999", address: "1 MAIN ST", bldgValue: 36000 }); // $24/sf
const comps = (count: number) => {
  const cands = Array.from({ length: count }, (_, k) => prop({ bldgValue: (18 + k) * 1500, lat: 41.9 + k * 0.0005 }));
  return { result: findComps(subject, cands), valueYear: 2026 };
};
const entry = (o: Partial<CalendarEntry>): CalendarEntry => ({
  year: 2026, region: "x", township: "T", noticeDate: "2026-10-08", lastFileDate: "2026-11-23", aRollCertified: null, aRollPublished: null,
  borStart: null, borEnd: null, pass: null, statusText: "", borEvidenceDeadline: null, ...o,
});
const text = (p: FilingPlan) => JSON.stringify(p);
const input = (e: CalendarEntry | null, today: string, c: ReturnType<typeof comps> | null = comps(6)) => ({ entry: e, property: subject, comps: c, today });

describe("daysBetween / describeDaysLeft", () => {
  it("counts whole days across months and years", () => {
    expect(daysBetween("2026-11-22", "2026-11-23")).toBe(1);
    expect(daysBetween("2026-11-22", "2026-12-08")).toBe(16);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-11-22", "2026-11-20")).toBe(-2);
  });
  it("words it", () => {
    expect(describeDaysLeft(0)).toMatch(/today/);
    expect(describeDaysLeft(1)).toBe("1 day left");
    expect(describeDaysLeft(9)).toBe("9 days left");
    expect(describeDaysLeft(-1)).toBe("deadline passed");
  });
});

describe("when the window is not open", () => {
  const cases: [string, CalendarEntry | null, string][] = [
    ["no calendar data", null, "2026-11-22"],
    ["not scheduled", entry({ noticeDate: null, lastFileDate: null }), "2026-11-22"],
    ["upcoming", entry({ noticeDate: "2026-12-01", lastFileDate: "2026-12-20" }), "2026-11-22"],
    ["between (Board dates unpublished)", entry({ lastFileDate: "2026-11-01" }), "2026-11-22"],
    ["closed", entry({ lastFileDate: "2026-06-01", borStart: "2026-08-03", borEnd: "2026-09-01" }), "2026-11-22"],
  ];
  it.each(cases)("%s: no steps and no link to a filing form", (_n, e, today) => {
    const p = buildFilingPlan(input(e, today));
    expect(p.track).toBe("not_open");
    expect(p.steps).toEqual([]);
    expect(text(p)).not.toContain(LINKS.assessorFile);
    expect(text(p)).not.toContain(LINKS.borFile);
    expect(text(p)).not.toContain("propertytaxfilings.cookcountyil.gov");
    expect(text(p)).not.toContain("appeals.cookcountyboardofreview.com");
  });
  it("says when the Board of Review opens", () => {
    const p = buildFilingPlan(input(entry({ lastFileDate: "2026-11-01", borStart: "2026-12-01", borEnd: "2026-12-30" }), "2026-11-22"));
    expect(p.headline).toMatch(/Dec 1, 2026/);
  });
});

describe("Assessor track", () => {
  const p = buildFilingPlan(input(entry({}), "2026-11-22"));
  it("is chosen when the Assessor window is open, with the deadline and days left", () => {
    expect(p.track).toBe("assessor");
    expect(p.deadline).toBe("2026-11-23");
    expect(p.daysLeft).toBe(1);
    expect(p.warnings.join(" ")).toMatch(/1 day left/);
  });
  it("walks through the county's steps and links to the official filing page", () => {
    expect(p.steps.map((s) => s.id)).toEqual(["ready", "open", "pin", "comps", "explain", "submit"]);
    expect(p.steps.find((s) => s.id === "open")!.link!.href).toBe(LINKS.assessorFileDirect(2026));
    expect(p.steps.find((s) => s.id === "open")!.link!.href).toMatch(/propertytaxfilings\.cookcountyil\.gov.*CCAO_APPEAL_RES_2026$/);
  });
  it("offers the PIN in both formats", () => {
    expect(p.steps.find((s) => s.id === "pin")!.copy!.map((c) => c.value)).toEqual(["99-99-999-999-9999", "99999999999999"]);
  });
  it("lists every comp with a copyable PIN, and warns against double dockets", () => {
    const step = p.steps.find((s) => s.id === "comps")!;
    expect(step.copy).toHaveLength(6);
    expect(step.copy![0].value).toMatch(/^\d{2}-\d{2}-\d{3}-\d{3}-\d{4}$/);
    expect(step.body.join(" ")).toMatch(/double docket/);
  });
  it("uses MAILED values in the statement", () => {
    expect(p.statement).toMatch(/mailed 2026/);
    expect(p.statement).toMatch(/\$24\.00\/sf/);
  });
});

describe("Board of Review track", () => {
  const e = entry({ lastFileDate: "2026-10-01", borStart: "2026-11-09", borEnd: "2026-12-08", borEvidenceDeadline: "2026-12-18" });
  const p = buildFilingPlan(input(e, "2026-11-22"));
  const step = (id: string) => p.steps.find((s) => s.id === id)!;
  it("is chosen when the Board window is open", () => {
    expect(p.track).toBe("bor");
    expect(p.deadline).toBe("2026-12-08");
    expect(p.daysLeft).toBe(16);
    expect(p.evidenceDeadline).toBe("2026-12-18");
  });
  it("follows the portal flow: account, start, details, notes, confirm", () => {
    expect(p.steps.map((s) => s.id)).toEqual(["eligible", "ready", "account", "start", "details", "comps", "confirm", "evidence"]);
  });
  it("says a consultant may not represent a homeowner, and that LLC/corporate owners need an attorney", () => {
    expect(step("eligible").body.join(" ")).toMatch(/consultant may not represent/i);
    expect(step("eligible").body.join(" ")).toMatch(/LLC/);
  });
  it("tells a first-time user to register, answering No to 'registering as an Attorney'", () => {
    expect(step("account").body.join(" ")).toMatch(/Are you registering as an Attorney\?.*No/);
    expect(step("account").link!.href).toBe(LINKS.borLogin);
  });
  it("walks the start of the complaint: Property Over Assessment, PIN, Associated PINs = No", () => {
    const body = step("start").body.join(" ");
    expect(body).toMatch(/Property Over Assessment/);
    expect(body).toMatch(/Associated PINs.*No/);
    expect(step("start").link!.href).toBe(LINKS.borFile);
    expect(step("start").copy!.map((c) => c.value)).toEqual(["99-99-999-999-9999", "99999999999999"]);
  });
  it("covers the hearing choice (optional) and the purchase-year dropdown", () => {
    const body = step("details").body.join(" ");
    expect(body).toMatch(/optional/);
    expect(body).toMatch(/Purchase year/);
    expect(body).toMatch(/Other/);
  });
  it("uses only the first 4 comps on the Notes page, and CERTIFIED values", () => {
    expect(step("comps").copy).toHaveLength(BOR_NOTES_COMPS);
    expect(p.statement).toMatch(/certified 2026/);
    expect(p.statement).toMatch(/I am submitting 4 comparable properties/);
  });
  it("ends with confirm, initial and submit", () => {
    expect(step("confirm").body.join(" ")).toMatch(/initial/i);
  });
  it("makes the evidence step conditional on choosing a hearing, with the deadline", () => {
    expect(step("evidence").title).toMatch(/Only if you chose a hearing/);
    expect(step("evidence").body.join(" ")).toMatch(/Dec 18, 2026/);
  });
});

describe("statement and edge cases", () => {
  it("includes every comp PIN and the count of lower-assessed properties", () => {
    const c = comps(6);
    const p = buildFilingPlan(input(entry({}), "2026-11-10", c));
    for (const comp of c.result.comps) expect(p.statement).toContain(comp.pin.slice(0, 2));
    expect(p.statement).toMatch(/Of 6 similar properties/);
    expect(p.statement).toMatch(/I am submitting 6 comparable properties/);
  });
  it("with no comps: no statement, a clear explanation, and still no promise to file", () => {
    const p = buildFilingPlan(input(entry({}), "2026-11-10", comps(0)));
    expect(p.statement).toBeNull();
    expect(p.steps.find((s) => s.id === "comps")!.body.join(" ")).toMatch(/may not help/);
    expect(p.steps.some((s) => s.id === "explain")).toBe(false);
  });
  it("with no comp data at all, warns and doesn't crash", () => {
    const p = buildFilingPlan(input(entry({}), "2026-11-10", null));
    expect(p.warnings.join(" ")).toMatch(/couldn't compute/);
    expect(p.statement).toBeNull();
  });
  it("only warns about the deadline when it is close", () => {
    expect(buildFilingPlan(input(entry({}), "2026-11-10")).warnings.join(" ")).not.toMatch(/days? left/);
  });
  it("never claims that we file on the homeowner's behalf", () => {
    for (const e of [entry({}), entry({ lastFileDate: "2026-10-01", borStart: "2026-11-09", borEnd: "2026-12-08" })]) {
      expect(text(buildFilingPlan(input(e, "2026-11-22")))).not.toMatch(/\bwe (will |can )?(file|submit)\b/i);
    }
  });
});

describe("a property that is NOT over-assessed relative to its neighbors (the real Hanover case)", () => {
  // Subject is $12/sf. Most neighbors are $16-$20/sf, but one is $10/sf: technically "lower by $1+", yet the subject is far below the median.
  const lowSubject = prop({ pin: "88888888888888", address: "5 LOW ST", bldgValue: 12 * 1500 });
  const neighbors = [10, 16, 17, 18, 19, 20, 21].map((r) => prop({ bldgValue: r * 1500 }));
  const result = findComps(lowSubject, neighbors);
  const open = entry({ lastFileDate: "2026-12-07" });
  const plan = buildFilingPlan({ entry: open, property: lowSubject, comps: { result, valueYear: 2026 }, today: "2026-11-22" });

  it("sanity: the engine still finds one technically-lower comp, which is exactly why a gate is needed", () => {
    expect(result.comps.length).toBe(1);
    expect(result.subjectRatio).toBeLessThan(result.medianRatio!);
  });
  it("does not support an appeal and says why", () => {
    expect(plan.supportsAppeal).toBe(false);
    expect(plan.warnings[0]).toMatch(/at or below the median/);
    expect(plan.warnings[0]).toMatch(/unlikely to help/);
  });
  it("drafts no claim of over-assessment and shows no 'saving'", () => {
    expect(plan.statement).toBeNull();
    expect(plan.illustration).toBeNull();
    expect(plan.steps.some((s) => s.id === "explain")).toBe(false);
  });
  it("does not hand over comps to enter", () => {
    const step = plan.steps.find((s) => s.id === "comps")!;
    expect(step.copy).toBeUndefined();
    expect(step.body.join(" ")).toMatch(/not suggesting comparable properties/);
  });
  it("still says the deadline, so the owner can decide on other grounds", () => {
    expect(plan.deadline).toBe("2026-12-07");
  });
});

describe("Board of Review track for a property that is not over-assessed", () => {
  it("still gives no comps or statement", () => {
    const low = prop({ pin: "77777777777777", address: "9 LOW ST", bldgValue: 12 * 1500 });
    const r = findComps(low, [10, 16, 17, 18, 19, 20, 21].map((x) => prop({ bldgValue: x * 1500 })));
    const p = buildFilingPlan({ entry: entry({ lastFileDate: "2026-10-01", borStart: "2026-11-09", borEnd: "2026-12-08" }), property: low, comps: { result: r, valueYear: 2026 }, today: "2026-11-22" });
    expect(p.track).toBe("bor");
    expect(p.supportsAppeal).toBe(false);
    expect(p.statement).toBeNull();
    expect(p.steps.find((s) => s.id === "comps")!.copy).toBeUndefined();
  });
});

describe("a property that IS above the median", () => {
  const plan = buildFilingPlan(input(entry({}), "2026-11-10"));
  it("supports an appeal, with a statement and an illustration that is a decrease", () => {
    expect(plan.supportsAppeal).toBe(true);
    expect(plan.statement).not.toBeNull();
    expect(plan.illustration).toMatch(/instead of/);
  });
});

describe("statement wording", () => {
  it("uses the singular for a single comp, and a single rate when there is no range", () => {
    // One eligible comp ($18/sf); four much larger homes ($19-22/sf) fail the size rule but keep the subject ($24/sf) above the median.
    const large = [19, 20, 21, 22].map((r) => prop({ bldgSf: 2400, bldgValue: r * 2400 }));
    const one = { result: findComps(subject, [prop({ bldgValue: 18 * 1500, lat: 41.9005 }), ...large]), valueYear: 2026 };
    expect(one.result.comps).toHaveLength(1);
    const p = buildFilingPlan(input(entry({}), "2026-11-10", one));
    expect(p.statement).toMatch(/1 comparable property that is similar/);
    expect(p.statement).toMatch(/located within/);
    expect(p.statement).not.toMatch(/\$18\.00\/sf to \$18\.00\/sf/);
    expect(p.statement).toMatch(/assessed at \$18\.00\/sf:/);
  });
});
