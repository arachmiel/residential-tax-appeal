import { describe, expect, it } from "vitest";
import { CompsError, findComps, haversineKm, ratioOf, type Property } from "@/lib/comps";

let n = 0;
function prop(over: Partial<Property> = {}): Property {
  n += 1;
  return {
    pin: String(10000000000000 + n),
    townshipCode: "70",
    nbhd: "100",
    propClass: "203",
    extWall: "Masonry",
    yearBuilt: 1960,
    bldgSf: 1500,
    landSf: 6000,
    bldgValue: 30000, // ratio 20
    isMultiCard: false,
    isMultiLand: false,
    prorationRate: 1,
    lat: 41.9,
    lon: -87.8,
    bsmt: "Full",
    bsmtFin: "Unfinished",
    garAtt: "No",
    garSize: "2 cars",
    ...over,
  };
}
const subject = () => prop({ pin: "99999999999999", bldgValue: 36000 }); // ratio 24, at 41.9,-87.8
const withRatio = (ratio: number, over: Partial<Property> = {}) => prop({ bldgValue: ratio * 1500, ...over });

describe("ratioOf", () => {
  it("is building value per sq ft", () => expect(ratioOf({ bldgValue: 30000, bldgSf: 1500 })).toBe(20));
  it("is null when data is missing or zero", () => {
    expect(ratioOf({ bldgValue: null, bldgSf: 1500 })).toBeNull();
    expect(ratioOf({ bldgValue: 30000, bldgSf: 0 })).toBeNull();
  });
});

describe("findComps", () => {
  it("with equally similar candidates, returns the lowest ratios first", () => {
    const cands = [18, 19, 17, 16, 15, 14, 13, 20].map((r) => withRatio(r));
    const res = findComps(subject(), cands);
    expect(res.comps.map((c) => c.ratio)).toEqual([13, 14, 15, 16, 17, 18]);
    expect(res.meetsTarget).toBe(true);
    expect(res.warnings).toEqual([]);
  });

  it("excludes multi-card, multi-land and split-assessment PINs", () => {
    const cands = [
      withRatio(10, { isMultiCard: true }),
      withRatio(10, { isMultiLand: true }),
      withRatio(10, { prorationRate: 0.5 }),
      withRatio(18),
    ];
    const res = findComps(subject(), cands);
    expect(res.comps).toHaveLength(1);
    expect(res.comps[0].ratio).toBe(18);
  });

  it("requires a different neighborhood, class or exterior to be excluded", () => {
    const cands = [
      withRatio(10, { nbhd: "999" }),
      withRatio(10, { propClass: "204" }),
      withRatio(10, { extWall: "Frame" }),
      withRatio(10, { townshipCode: "71" }),
    ];
    expect(findComps(subject(), cands).comps).toHaveLength(0);
  });

  it("never includes the subject itself", () => {
    const s = subject();
    const res = findComps(s, [{ ...s, bldgValue: 1500 * 10 }]);
    expect(res.comps).toHaveLength(0);
  });

  it("treats ratios less than $1/sf below the subject as uniform", () => {
    const res = findComps(subject(), [withRatio(23.5), withRatio(23)]); // subject is 24
    expect(res.comps.map((c) => c.ratio)).toEqual([23]);
  });

  it("drops anomalous ratios but keeps them out of the rank too", () => {
    const cands = [withRatio(4), ...[16, 17, 18, 19, 20, 21].map((r) => withRatio(r))];
    const res = findComps(subject(), cands);
    expect(res.comps.map((c) => c.ratio)).not.toContain(4);
    expect(res.groupSize).toBe(6);
  });

  it("widens the age window in steps and says so", () => {
    const close = [withRatio(18, { yearBuilt: 1962 }), withRatio(19, { yearBuilt: 1958 })];
    const further = [14, 15, 16, 17].map((r) => withRatio(r, { yearBuilt: 1952 })); // 8 years off
    const res = findComps(subject(), [...close, ...further]);
    expect(res.ageToleranceUsed).toBe(10);
    expect(res.comps).toHaveLength(6);
    expect(res.warnings.join(" ")).toMatch(/widened to ±10/);
  });

  it("stops at the narrowest window that works", () => {
    const cands = [13, 14, 15, 16, 17, 18, 19].map((r) => withRatio(r, { yearBuilt: 1961 }));
    expect(findComps(subject(), cands).ageToleranceUsed).toBe(5);
  });

  it("ignores comps outside the largest age window, and warns when short", () => {
    const res = findComps(subject(), [withRatio(10, { yearBuilt: 1900 }), withRatio(18)]);
    expect(res.comps).toHaveLength(1);
    expect(res.meetsTarget).toBe(false);
    expect(res.warnings.join(" ")).toMatch(/Only 1/);
  });

  it("explains the difference between 'already uniform' and 'lower but not similar'", () => {
    const uniform = findComps(subject(), [withRatio(30), withRatio(23.5)]);
    expect(uniform.warnings.join(" ")).toMatch(/already be assessed uniformly/);
    const notSimilar = findComps(subject(), [withRatio(10, { yearBuilt: 1900 }), withRatio(11, { yearBuilt: 1890 })]);
    expect(notSimilar.warnings.join(" ")).toMatch(/2 similar properties are assessed lower per sq ft, but none are close enough/);
  });

  it("filters by building and land size", () => {
    const cands = [withRatio(10, { bldgSf: 2200, bldgValue: 22000 }), withRatio(10, { landSf: 20000 }), withRatio(12)];
    const res = findComps(subject(), cands);
    expect(res.comps).toHaveLength(1);
  });

  it("reports how many properties in the group pay less per sq ft", () => {
    const cands = [10, 12, 14, 30, 31].map((r) => withRatio(r));
    const res = findComps(subject(), cands);
    expect(res.groupSize).toBe(5);
    expect(res.paysMoreThan).toBe(3);
    expect(res.medianRatio).toBe(14);
  });

  it("warns instead of crashing when nothing matches", () => {
    const res = findComps(subject(), []);
    expect(res.comps).toEqual([]);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("copes with a missing year built", () => {
    const s = { ...subject(), yearBuilt: null };
    const res = findComps(s, [withRatio(18, { yearBuilt: 1800 })]);
    expect(res.comps).toHaveLength(1);
    expect(res.warnings.join(" ")).toMatch(/Year built is missing/);
  });

  it("throws a clear error when the subject has no ratio", () => {
    expect(() => findComps({ ...subject(), bldgSf: null }, [])).toThrow(CompsError);
  });

  it("warns when the subject itself is multi-card", () => {
    const res = findComps({ ...subject(), isMultiCard: true }, [withRatio(18)]);
    expect(res.warnings.join(" ")).toMatch(/multiple cards/);
  });
});

describe("similarity ranking (the Assessor wants the closest comps, not the lowest)", () => {
  it("prefers a more similar property over a lower-valued, less similar one", () => {
    const similar = Array.from({ length: 6 }, (_, k) => withRatio(20 + k * 0.1)); // ratios 20.0-20.5, identical in every factor
    const lowButDifferent = withRatio(12, { yearBuilt: 1969, bldgSf: 1650, bsmt: "Slab", garSize: "0 cars" }); // lowest ratio, but dissimilar
    const res = findComps(subject(), [lowButDifferent, ...similar]);
    expect(res.comps.map((c) => c.pin)).not.toContain(lowButDifferent.pin);
    expect(res.comps).toHaveLength(6);
  });

  it("ranks nearer properties ahead of farther ones", () => {
    const near = withRatio(20, { lat: 41.9005, lon: -87.8 });
    const far = withRatio(15, { lat: 41.93, lon: -87.8 }); // ~3.3 km away, much lower ratio
    const res = findComps(subject(), [far, near], { count: 1 });
    expect(res.comps[0].pin).toBe(near.pin);
    expect(res.comps[0].km).toBeLessThan(0.1);
  });

  it("penalises a different basement and garage", () => {
    const match = withRatio(20);
    const noMatch = withRatio(15, { bsmt: "Slab", garAtt: "Yes", garSize: "0 cars" });
    expect(findComps(subject(), [noMatch, match], { count: 1 }).comps[0].pin).toBe(match.pin);
  });

  it("applies size limits as a percentage of the subject, not a fixed number", () => {
    const big = { ...subject(), bldgSf: 3000, bldgValue: 72000, landSf: 8000 }; // ratio 24
    const plus400 = withRatio(18, { bldgSf: 3400, bldgValue: 18 * 3400, landSf: 8000 }); // +13%: fine for a big house
    expect(findComps(big, [plus400]).comps).toHaveLength(1);
    const small = { ...subject(), bldgSf: 1000, bldgValue: 24000 };
    const alsoPlus400 = withRatio(18, { bldgSf: 1400, bldgValue: 18 * 1400 }); // +40%: too different for a small one
    expect(findComps(small, [alsoPlus400]).comps).toHaveLength(0);
  });

  it("still works, and says so, when coordinates are missing", () => {
    const res = findComps({ ...subject(), lat: null, lon: null }, [withRatio(18)]);
    expect(res.comps).toHaveLength(1);
    expect(res.warnings.join(" ")).toMatch(/no map coordinates/);
  });

  it("measures great-circle distance", () => {
    expect(haversineKm(41.9, -87.8, 41.9, -87.8)).toBe(0);
    expect(haversineKm(41.9, -87.8, 41.91, -87.8)).toBeCloseTo(1.11, 1);
  });
});
