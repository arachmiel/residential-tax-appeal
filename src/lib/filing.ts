import { appealStage, type AppealStage, type CalendarEntry } from "./calendar";
import type { CompsResult, Property } from "./comps";
import { money, niceDate, perSf } from "./format";
import { formatPin } from "./pin";

/**
 * Builds the step-by-step checklist a homeowner follows to file their OWN appeal.
 *
 * This site never files for anyone. Steps are taken from the county's published instructions (Assessor "File an Appeal
 * Online" page and 2026 Appeal Guidelines; Board of Review residential pages). We only describe screens and fields the
 * county itself describes, and we say so when something couldn't be verified.
 */

export interface CopyField {
  label: string;
  value: string;
}

export interface Step {
  id: string;
  title: string;
  body: string[];
  copy?: CopyField[];
  link?: { href: string; label: string };
}

export type Track = "assessor" | "bor" | "not_open";

export interface FilingPlan {
  track: Track;
  stage: AppealStage | null;
  headline: string;
  detail: string;
  /** Last day to file on this track. */
  deadline: string | null;
  daysLeft: number | null;
  /** Board of Review only: last day to submit supporting documents if you want a hearing. */
  evidenceDeadline: string | null;
  /** False when the data does not support a uniformity appeal (assessed at or below the median of similar properties). */
  supportsAppeal: boolean;
  steps: Step[];
  /** Draft explanation the homeowner can edit, sign and submit. */
  statement: string | null;
  /** The "$X/sq ft lower" arithmetic, for context only. */
  illustration: string | null;
  warnings: string[];
}

export const LINKS = {
  assessorFile: "https://www.cookcountyassessoril.gov/online-appeals",
  assessorGuidelines: "https://prodassets.cookcountyassessoril.gov/s3fs-public/event/2026%20Appeal%20Guidelines%203.13.2026.pdf",
  assessorCalendar: "https://www.cookcountyassessoril.gov/assessment-calendar-and-deadlines",
  borFile: "https://appeals.cookcountyboardofreview.com/SubmitAppeal/AppealPage1",
  borResidential: "https://www.cookcountyboardofreview.com/residential-appeals",
  borHearings: "https://www.cookcountyboardofreview.com/residential-hearings",
  borDates: "https://www.cookcountyboardofreview.com/dates-and-deadlines",
  borPhone: "312-603-5542",
} as const;

/** Whole days from `from` to `to` (both ISO yyyy-mm-dd); negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function describeDaysLeft(n: number | null): string {
  if (n === null) return "";
  if (n < 0) return "deadline passed";
  if (n === 0) return "last day: file today";
  if (n === 1) return "1 day left";
  return `${n} days left`;
}

interface PlanInput {
  entry: CalendarEntry | null;
  property: Pick<Property, "pin" | "address" | "bldgSf" | "yearBuilt">;
  comps: { result: CompsResult; valueYear: number } | null;
  today: string;
}

/**
 * Is this property assessed ABOVE the median of its similar properties? Only then does a uniformity appeal have a case.
 * Returns null when there is no usable comparison.
 */
export function isAboveMedian(r: Pick<CompsResult, "subjectRatio" | "medianRatio"> | null): boolean | null {
  if (!r || r.medianRatio === null) return null;
  return r.subjectRatio > r.medianRatio;
}

function rangeText(ratios: number[]): string {
  const lo = Math.min(...ratios);
  const hi = Math.max(...ratios);
  return perSf(lo) === perSf(hi) ? perSf(lo) : `${perSf(lo)} to ${perSf(hi)}`;
}

const compLabel = (c: { pin: string; address?: string | null }) => `${formatPin(c.pin)}${c.address ? ` (${c.address})` : ""}`;

export function buildFilingPlan({ entry, property, comps, today }: PlanInput): FilingPlan {
  const stage = entry ? appealStage(entry, today) : null;
  const base = { stage, supportsAppeal: true, evidenceDeadline: null as string | null, steps: [] as Step[], statement: null, illustration: null, warnings: [] as string[] };

  // ---- not open: say when, and don't send anyone to a form that may delete an early file ----
  if (!entry || stage === null || stage === "not_scheduled") {
    return { ...base, track: "not_open", headline: "No appeal dates are published for your township yet", deadline: null, daysLeft: null,
      detail: "We check the Assessor's and Board of Review's calendars every day. The county warns that starting a file before your township opens may get it deleted, so wait until it opens." };
  }
  if (stage === "upcoming") {
    return { ...base, track: "not_open", headline: `Your township opens ${niceDate(entry.noticeDate)}`, deadline: entry.lastFileDate, daysLeft: null,
      detail: "Filing opens once the reassessment notice is mailed. The county warns that starting a file before your township opens may get it deleted." };
  }
  if (stage === "between") {
    return { ...base, track: "not_open",
      headline: entry.borStart ? `Board of Review filing opens ${niceDate(entry.borStart)}` : "The Assessor's window has closed; Board of Review dates aren't published yet",
      deadline: entry.borEnd, daysLeft: null,
      detail: entry.borStart ? `The Board of Review accepts complaints ${niceDate(entry.borStart)} – ${niceDate(entry.borEnd)}.` : "We'll show them here as soon as the Board of Review schedules your township." };
  }
  if (stage === "closed") {
    return { ...base, track: "not_open", headline: "Appeals are closed for your township this year", deadline: null, daysLeft: null,
      detail: `The Assessor's deadline was ${niceDate(entry.lastFileDate)}${entry.borEnd ? ` and the Board of Review's was ${niceDate(entry.borEnd)}` : ""}. Check back next year, or ask the Board of Review (${LINKS.borPhone}) whether any later option applies to you.` };
  }

  // ---- open ----
  const track: Track = stage === "assessor_open" ? "assessor" : "bor";
  const deadline = track === "assessor" ? entry.lastFileDate : entry.borEnd;
  const daysLeft = deadline ? daysBetween(today, deadline) : null;
  const evidenceDeadline = track === "bor" ? (entry.borEvidenceDeadline ?? null) : null;
  const basis = track === "assessor" ? "mailed" : "certified";

  const r = comps?.result ?? null;
  const list = r?.comps ?? [];
  const pinDashed = formatPin(property.pin);
  const warnings: string[] = [...(r?.warnings ?? [])];
  if (!comps) warnings.push("We couldn't compute comparable properties for this PIN (missing building size or value data). You may still appeal on other grounds.");
  if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3) warnings.push(`Only ${describeDaysLeft(daysLeft)}: the county does not accept late filings.`);

  const median = r?.medianRatio ?? null;
  const above = isAboveMedian(r);
  // At or below the median of similar properties: do not recommend comps, draft a claim, or show a "saving".
  const supportsAppeal = above !== false;
  if (above === false && r && median !== null) {
    warnings.unshift(
      `Your building is assessed at ${perSf(r.subjectRatio)}, at or below the median of ${perSf(median)} for similar properties (only ${r.paysMoreThan} of ${r.groupSize} are assessed lower). A comparables appeal is unlikely to help you, so we are not suggesting comps or drafting an explanation. You may still have other grounds, such as an error in your property's records (square footage, characteristics, class); see the Assessor's guidelines.`,
    );
  }
  const maxKm = list.reduce((m, c) => (c.km !== null && c.km > m ? c.km : m), 0);
  const statement =
    r && list.length > 0 && supportsAppeal
      ? [
          `I am the owner of ${property.address ?? "the property"} (PIN ${pinDashed}). I believe my property is assessed higher than similar properties in my neighborhood.`,
          `On the ${basis} ${comps!.valueYear} values, my building is assessed at ${perSf(r.subjectRatio)} of building area. Of ${r.groupSize} similar properties in my neighborhood (same class and exterior construction), ${r.paysMoreThan} are assessed lower per square foot${median !== null ? `, and the median is ${perSf(median)}` : ""}.`,
          `I am submitting ${list.length} comparable ${list.length === 1 ? "property that is" : "properties that are"} similar to mine in building size, age, exterior construction, basement, garage and land size${maxKm > 0 ? `, ${list.length === 1 ? "located" : "all located"} within ${(maxKm * 0.621371).toFixed(2)} miles` : ""}, assessed at ${rangeText(list.map((c) => c.ratio))}:`,
          ...list.map((c, i) => `  ${i + 1}. ${compLabel(c)} - ${perSf(c.ratio)}`),
          `I respectfully request that my assessment be made uniform with these properties.`,
        ].join("\n")
      : null;

  const illustration =
    r && median !== null && property.bldgSf && above
      ? `Illustration only, not a prediction: at the median rate of similar properties (${perSf(median)}), a ${property.bldgSf.toLocaleString("en-US")} sq ft building would be assessed at ${money(median * property.bldgSf)} instead of ${money(r.subjectRatio * property.bldgSf)}.`
      : null;

  const compsStep: Step = !supportsAppeal
    ? {
        id: "comps",
        title: "Comparable properties",
        body: ["We are not suggesting comparable properties for this PIN because it is not assessed above the median of similar properties (see the note above). If you appeal on other grounds, use that evidence instead."],
      }
    : {
    id: "comps",
    title: list.length > 0 ? `Enter your ${list.length} comparable ${list.length === 1 ? "property" : "properties"}` : "Comparable properties",
    body:
      list.length > 0
        ? [
            "These are the most similar properties in your neighborhood that are assessed lower per square foot, chosen for similarity (size, age, exterior, basement, garage, land and distance), as the Assessor's guidelines ask.",
            ...(track === "assessor"
              ? ["Enter them as comparable properties inside your single application. Do not start a separate appeal for each one (the county calls that a \"double docket\")."]
              : []),
          ]
        : ["We did not find similar properties that are assessed lower, so a comparables argument may not help. See the warnings above, and consider whether a factual error in your property's records (square footage, characteristics, class) applies instead."],
    copy: list.map((c, i) => ({ label: `Comp ${i + 1}: ${c.address ?? "address unavailable"}`, value: formatPin(c.pin) })),
  };

  const steps: Step[] =
    track === "assessor"
      ? [
          { id: "ready", title: "Get ready", body: [
              `Your township is open for Assessor appeals until ${niceDate(deadline)} (${describeDaysLeft(daysLeft)}). Only one application per property.`,
              "You need an email address: the county uses it to create your account and to send your Filing ID and docket number.",
            ] },
          { id: "open", title: "Open the Assessor's online filing and choose Residential", body: [
              "Residential covers single-family homes, townhomes and buildings with no more than six units. You can save a draft and come back before submitting.",
            ], link: { href: LINKS.assessorFile, label: "Open the Assessor's filing page" } },
          { id: "pin", title: "Enter your PIN", body: ["Use whichever format the form accepts."],
            copy: [{ label: "Your PIN (with dashes)", value: pinDashed }, { label: "Your PIN (digits only)", value: property.pin }] },
          compsStep,
          ...(statement ? [{ id: "explain", title: "Optional: add your explanation", body: ["If the application has a place for an explanation, you can paste or adapt the draft below. It is yours to edit; check every number."] } satisfies Step] : []),
          { id: "submit", title: `Review and submit by ${niceDate(deadline)}`, body: [
              "Submit once. You'll get an email confirming your submission and a second email with your docket number. Keep both.",
              "The Assessor mails the result.",
            ], link: { href: LINKS.assessorGuidelines, label: "Read the Assessor's 2026 appeal guidelines" } },
        ]
      : [
          { id: "eligible", title: "Check who can file", body: [
              "Individual owners may represent themselves at the Board of Review. If the property is owned by a corporation or LLC, an attorney must file. A consultant may not represent a homeowner at the Board of Review, so you must file this yourself.",
              "Residential means a single-family home, small apartment building or mixed-use property with fewer than 7 units and under 20,000 sq ft.",
            ], link: { href: LINKS.borResidential, label: "Board of Review residential filing" } },
          { id: "ready", title: "Get ready", body: [
              `Your township's Board of Review window closes ${niceDate(deadline)} (${describeDaysLeft(daysLeft)}).`,
              "The Board compares the certified values (after the Assessor's review), so the comparison below uses certified values.",
            ] },
          { id: "file", title: "File your complaint", body: [
              `File online, or deliver or mail an original Board of Review complaint form (forms are at Board of Review offices, or call ${LINKS.borPhone}). We could not test the Board's online portal, so follow its on-screen instructions.`,
            ], link: { href: LINKS.borFile, label: "Open the Board of Review's online filing" },
            copy: [{ label: "Your PIN (with dashes)", value: pinDashed }, { label: "Your PIN (digits only)", value: property.pin }] },
          compsStep,
          { id: "evidence", title: "Decide about a hearing and gather evidence", body: [
              "A hearing is optional and held by phone; you will not be penalized for waiving it. If you want one, the Board asks for supporting documents by the deadline after your township closes" + (evidenceDeadline ? `: ${niceDate(evidenceDeadline)}.` : "."),
              "Typical evidence: a current photo of your property's exterior, the PINs of your comparable properties, and a signed statement explaining why you think the property is over-assessed (draft below).",
            ], link: { href: LINKS.borHearings, label: "About Board of Review hearings" } },
          { id: "after", title: "Wait for the result", body: ["The Board of Review mails its decision."] },
        ];

  return {
    track, stage,
    headline: track === "assessor" ? "Your township is open for Assessor appeals" : "The Board of Review is open for your township",
    detail: deadline ? `Deadline ${niceDate(deadline)}: ${describeDaysLeft(daysLeft)}.` : "",
    deadline, daysLeft, evidenceDeadline, supportsAppeal, steps, statement, illustration, warnings,
  };
}
