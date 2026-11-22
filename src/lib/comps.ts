/**
 * Comparable-property selection for a uniformity appeal.
 *
 * Logic carried over from the original Residential Tax Appeal site:
 *   - ratio = building assessed value / building square feet
 *   - comparable = same township, neighborhood, class and exterior wall; single-card, single-land, fully prorated PINs
 *   - similar age / building size / land size
 *   - at least `minRatioGap` dollars/sq ft LOWER than the subject (smaller gaps are considered "uniform")
 *   - obviously anomalous ratios are excluded
 *   - the lowest ratios win; best `count` are returned
 *
 * Changes from the original:
 *   - the value basis is explicit: appeal 1 (Assessor) uses MAILED values, the Board of Review uses CERTIFIED values
 *   - age tolerance widens in steps (5 -> 10 -> 15 years) instead of one fixed window
 *   - the result says how it got there (warnings, tolerance used, rank) so the UI can explain it
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
}

export interface CompsOptions {
  count: number;
  /** Age windows to try in order, in years. Stops at the first that yields `count` comps. */
  ageSteps: number[];
  /** Inherited from the old site's SQL; unvalidated, so tune against real outcomes. */
  bldgSfTolerance: number;
  landSfTolerance: number;
  /** Comp ratio must be at least this many $/sf below the subject. */
  minRatioGap: number;
  /** Ratios below this fraction of the group median are treated as data errors. */
  outlierFloor: number;
}

export const DEFAULT_OPTIONS: CompsOptions = {
  count: 6,
  ageSteps: [5, 10, 15],
  bldgSfTolerance: 294,
  landSfTolerance: 1242,
  minRatioGap: 1,
  outlierFloor: 0.5,
};

export interface Comp extends Property {
  ratio: number;
}

export interface CompsResult {
  subjectRatio: number;
  /** Matching properties (same twp/nbhd/class/wall, eligible, outliers removed). */
  groupSize: number;
  /** How many of the group have a LOWER ratio than the subject, i.e. pay less per sq ft. */
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

export function findComps(subject: Property, candidates: Property[], overrides: Partial<CompsOptions> = {}): CompsResult {
  const opt = { ...DEFAULT_OPTIONS, ...overrides };
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
    pool.push({ ...c, ratio });
  }

  // 2. Drop data-error outliers (e.g. $4/sf when the group sits around $15-20/sf).
  const med = median(pool.map((c) => c.ratio));
  const group = med === null ? [] : pool.filter((c) => c.ratio >= med * opt.outlierFloor);
  const paysMoreThan = group.filter((c) => c.ratio < subjectRatio).length;

  if (group.length === 0) warnings.push("No other properties in this neighborhood match the same class and exterior.");

  // 3. Find the narrowest age window that yields enough comps.
  const base = group.filter(
    (c) =>
      c.ratio <= subjectRatio - opt.minRatioGap &&
      subject.bldgSf !== null &&
      c.bldgSf !== null &&
      Math.abs(c.bldgSf - subject.bldgSf) <= opt.bldgSfTolerance &&
      (subject.landSf === null || c.landSf === null || Math.abs(c.landSf - subject.landSf) <= opt.landSfTolerance),
  );

  let chosen: Comp[] = [];
  let ageUsed: number | null = null;

  if (subject.yearBuilt === null) {
    warnings.push("Year built is missing for this property, so age was not considered.");
    chosen = [...base].sort((a, b) => a.ratio - b.ratio).slice(0, opt.count);
  } else {
    for (const tol of opt.ageSteps) {
      const within = base.filter((c) => c.yearBuilt !== null && Math.abs(c.yearBuilt - subject.yearBuilt!) <= tol);
      chosen = within.sort((a, b) => a.ratio - b.ratio).slice(0, opt.count);
      ageUsed = tol;
      if (chosen.length >= opt.count) break;
    }
  }

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
