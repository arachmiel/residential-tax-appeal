/**
 * Comparable-property selection for a uniformity appeal.
 *
 * The Cook County Assessor's 2026 appeal guidelines say comps should be chosen for what they have in common with the
 * subject, NOT cherry-picked as the lowest-valued properties, and name seven factors: proximity, square footage, age,
 * exterior construction, basement, land square footage and garage. So the selection works in two steps:
 *
 *   1. ELIGIBILITY (hard rules): same township, neighborhood, class and exterior wall; single-card, single-parcel,
 *      fully prorated PIN; building and land size within a percentage of the subject; age within a window; and
 *      assessed at least `minRatioGap` $/sq ft BELOW the subject (smaller gaps are "uniform" and don't support an appeal).
 *   2. RANKING: among eligible properties, the MOST SIMILAR win (a weighted distance over the factors above), not the lowest.
 *
 * ratio = building assessed value / building square feet. Appeal 1 (Assessor) compares MAILED values; the Board of
 * Review compares CERTIFIED values; the caller picks the basis by passing the matching `bldgValue`.
 */

export interface Property {
  pin: string;
  address?: string | null;
  townshipCode: string;
  nbhd: string;
  propClass: string;
  extWall: string | null;
  yearBuilt: number | null;
  bldgSf: number | null;
  landSf: number | null;
  /** Building assessed value on the chosen basis (mailed or certified). */
  bldgValue: number | null;
  isMultiCard: boolean;
  isMultiLand: boolean;
  /** 1 = the whole PIN is this parcel. Below 1 means value is split across PINs. */
  prorationRate: number;
  lat?: number | null;
  lon?: number | null;
  /** Basement type, e.g. "Full", "Partial", "Slab", "Crawl". */
  bsmt?: string | null;
  /** Basement finish, e.g. "Formal Rec Room", "Unfinished". */
  bsmtFin?: string | null;
  /** Garage attached? ("Yes"/"No") and size ("2 cars"). */
  garAtt?: string | null;
  garSize?: string | null;
}

export interface SimilarityWeights {
  proximity: number;
  size: number;
  age: number;
  land: number;
  basement: number;
  garage: number;
}

export interface CompsOptions {
  count: number;
  /** Age windows (years) to try in order; stops at the first that yields `count` comps. */
  ageSteps: number[];
  /** Max building-size difference as a fraction of the subject's (0.2 = ±20%). */
  bldgSfPct: number;
  /** Max land-size difference as a fraction of the subject's. */
  landSfPct: number;
  /** Comp ratio must be at least this many $/sq ft below the subject. */
  minRatioGap: number;
  /** Ratios below this fraction of the group median are treated as data errors. */
  outlierFloor: number;
  /** Distance (km) that counts as "one unit" of dissimilarity. ~0.8 km = half a mile. */
  proximityScaleKm: number;
  /** Age difference (years) that counts as one unit. */
  ageScaleYears: number;
  weights: SimilarityWeights;
}

export const DEFAULT_OPTIONS: CompsOptions = {
  count: 6,
  ageSteps: [5, 10, 15],
  bldgSfPct: 0.2,
  landSfPct: 0.3,
  minRatioGap: 1,
  outlierFloor: 0.5,
  proximityScaleKm: 0.8,
  ageScaleYears: 10,
  weights: { proximity: 1, size: 1, age: 1, land: 1, basement: 1, garage: 1 },
};

export interface Comp extends Property {
  ratio: number;
  /** Weighted dissimilarity to the subject. 0 = identical on every factor; lower is more similar. */
  distance: number;
  /** Straight-line distance to the subject in km, when both have coordinates. */
  km: number | null;
}

export interface CompsResult {
  subjectRatio: number;
  /** Matching properties (same twp/nbhd/class/wall, eligible, outliers removed). */
  groupSize: number;
  /** How many of the group have a LOWER ratio than the subject, i.e. are assessed lower per sq ft. */
  paysMoreThan: number;
  medianRatio: number | null;
  comps: Comp[];
  ageToleranceUsed: number | null;
  meetsTarget: boolean;
  warnings: string[];
}

export class CompsError extends Error {}

export function ratioOf(p: Pick<Property, "bldgValue" | "bldgSf">): number | null {
  if (!p.bldgValue || !p.bldgSf || p.bldgValue <= 0 || p.bldgSf <= 0) return null;
  return p.bldgValue / p.bldgSf;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function eligible(p: Property): boolean {
  return !p.isMultiCard && !p.isMultiLand && p.prorationRate === 1;
}

/** Great-circle distance in km. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const same = (a?: string | null, b?: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Weighted dissimilarity of `c` to `s`. A factor with missing data on either side contributes nothing. */
export function dissimilarity(s: Property, c: Property, opt: CompsOptions): { distance: number; km: number | null } {
  const w = opt.weights;
  let d = 0;

  let km: number | null = null;
  if (s.lat != null && s.lon != null && c.lat != null && c.lon != null) {
    km = haversineKm(s.lat, s.lon, c.lat, c.lon);
    d += w.proximity * (km / opt.proximityScaleKm);
  }
  if (s.bldgSf && c.bldgSf) d += (w.size * Math.abs(c.bldgSf - s.bldgSf)) / s.bldgSf / opt.bldgSfPct;
  if (s.yearBuilt != null && c.yearBuilt != null) d += (w.age * Math.abs(c.yearBuilt - s.yearBuilt)) / opt.ageScaleYears;
  if (s.landSf && c.landSf) d += (w.land * Math.abs(c.landSf - s.landSf)) / s.landSf / opt.landSfPct;
  if (s.bsmt != null && c.bsmt != null) {
    d += w.basement * (!same(s.bsmt, c.bsmt) ? 1 : !same(s.bsmtFin, c.bsmtFin) ? 0.5 : 0);
  }
  if (s.garSize != null && c.garSize != null) {
    d += w.garage * ((same(s.garAtt, c.garAtt) ? 0 : 0.5) + (same(s.garSize, c.garSize) ? 0 : 0.5));
  }
  return { distance: d, km };
}

export function findComps(subject: Property, candidates: Property[], overrides: Partial<CompsOptions> = {}): CompsResult {
  const opt: CompsOptions = { ...DEFAULT_OPTIONS, ...overrides, weights: { ...DEFAULT_OPTIONS.weights, ...overrides.weights } };
  const warnings: string[] = [];

  const subjectRatio = ratioOf(subject);
  if (subjectRatio === null) {
    throw new CompsError("This property has no building value or building square footage, so it can't be compared.");
  }
  if (!eligible(subject)) {
    warnings.push(
      "This PIN has multiple cards, multiple parcels or a split assessment, so its ratio may not be a fair comparison.",
    );
  }

  // 1. Same neighborhood group, eligible, with a usable ratio.
  const pool: Comp[] = [];
  for (const c of candidates) {
    if (c.pin === subject.pin) continue;
    if (c.townshipCode !== subject.townshipCode || c.nbhd !== subject.nbhd || c.propClass !== subject.propClass) continue;
    if (subject.extWall && c.extWall !== subject.extWall) continue;
    if (!eligible(c)) continue;
    const ratio = ratioOf(c);
    if (ratio === null) continue;
    const { distance, km } = dissimilarity(subject, c, opt);
    pool.push({ ...c, ratio, distance, km });
  }

  // 2. Drop data-error outliers (e.g. $4/sf when the group sits around $15-20/sf).
  const med = median(pool.map((c) => c.ratio));
  const group = med === null ? [] : pool.filter((c) => c.ratio >= med * opt.outlierFloor);
  const paysMoreThan = group.filter((c) => c.ratio < subjectRatio).length;

  if (group.length === 0) warnings.push("No other properties in this neighborhood match the same class and exterior.");

  // 3. Eligibility: lower ratio, and similar size and land (as a percentage of the subject's).
  const base = group.filter(
    (c) =>
      c.ratio <= subjectRatio - opt.minRatioGap &&
      subject.bldgSf !== null &&
      c.bldgSf !== null &&
      Math.abs(c.bldgSf - subject.bldgSf) <= opt.bldgSfPct * subject.bldgSf &&
      (subject.landSf === null || c.landSf === null || Math.abs(c.landSf - subject.landSf) <= opt.landSfPct * subject.landSf),
  );

  // 4. Narrowest age window that yields enough comps; within it, the MOST SIMILAR win.
  const mostSimilar = (xs: Comp[]) => [...xs].sort((a, b) => a.distance - b.distance || a.ratio - b.ratio).slice(0, opt.count);
  let chosen: Comp[] = [];
  let ageUsed: number | null = null;

  if (subject.yearBuilt === null) {
    warnings.push("Year built is missing for this property, so age was not considered.");
    chosen = mostSimilar(base);
  } else {
    for (const tol of opt.ageSteps) {
      chosen = mostSimilar(base.filter((c) => c.yearBuilt !== null && Math.abs(c.yearBuilt - subject.yearBuilt!) <= tol));
      ageUsed = tol;
      if (chosen.length >= opt.count) break;
    }
  }

  if (subject.lat == null || subject.lon == null) warnings.push("This property has no map coordinates, so proximity was not considered.");

  const meetsTarget = chosen.length >= opt.count;
  if (!meetsTarget) {
    const lowerCount = group.filter((c) => c.ratio <= subjectRatio - opt.minRatioGap).length;
    if (chosen.length > 0) {
      warnings.push(`Only ${chosen.length} suitable comparable properties were found (target ${opt.count}).`);
    } else if (lowerCount === 0 && group.length > 0) {
      warnings.push("No similar properties are assessed at least $1/sq ft lower, so you may already be assessed uniformly.");
    } else if (lowerCount > 0) {
      warnings.push(
        `${lowerCount} similar ${lowerCount === 1 ? "property is" : "properties are"} assessed lower per sq ft, but none are close enough in age and size to use as comparables.`,
      );
    }
  } else if (ageUsed !== null && ageUsed > opt.ageSteps[0]) {
    warnings.push(`Not enough close-in-age matches, so the age window was widened to ±${ageUsed} years.`);
  }

  return {
    subjectRatio,
    groupSize: group.length,
    paysMoreThan,
    medianRatio: median(group.map((c) => c.ratio)),
    comps: chosen,
    ageToleranceUsed: ageUsed,
    meetsTarget,
    warnings,
  };
}
