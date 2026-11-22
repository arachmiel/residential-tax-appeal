import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { PrintButton } from "@/components/PrintButton";
import { StepList } from "@/components/StepList";
import { appealStage } from "@/lib/calendar";
import { buildFilingPlan } from "@/lib/filing";
import { todayIso } from "@/lib/format";
import { formatPin, normalizePin } from "@/lib/pin";
import { getCalendarForTownship, getComps, getProperty, toCalendarEntry } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pin: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const pin = normalizePin((await params).pin);
  return { title: pin ? `Appeal checklist · PIN ${formatPin(pin)}` : "Appeal checklist" };
}

export default async function FilingChecklist({ params }: Params) {
  const pin = normalizePin((await params).pin);
  if (!pin) notFound();
  const property = await getProperty(pin);
  if (!property) notFound();

  const calRow = property.townshipName ? await getCalendarForTownship(property.townshipName) : null;
  const entry = calRow ? toCalendarEntry(calRow) : null;
  const today = todayIso();
  const stage = entry ? appealStage(entry, today) : null;
  // Assessor appeals compare MAILED values; the Board of Review compares CERTIFIED values.
  const comps = stage === "assessor_open" || stage === "bor_open" ? await getComps(pin, stage === "bor_open" ? "certified" : "mailed").catch(() => null) : null;

  const plan = buildFilingPlan({
    entry,
    property: { pin, address: property.address, bldgSf: property.bldgSf, yearBuilt: property.yearBuilt },
    comps,
    today,
  });

  return (
    <>
      <p className="meta no-print"><Link href={`/property/${pin}`}>← Back to {property.address ?? formatPin(pin)}</Link></p>
      <h1>Your appeal checklist</h1>
      <p className="meta">{property.address} · PIN {formatPin(pin)} · {property.townshipName} township</p>

      <div className={`banner ${plan.track === "not_open" || !plan.supportsAppeal ? "warn" : "open"}`}>
        <strong>{plan.headline}</strong>
        {plan.detail}
        {plan.track !== "not_open" && !plan.supportsAppeal && " Our data does not show your property as over-assessed compared with similar properties; read the note below before deciding."}
      </div>

      <p className="notice">
        <strong>You file your own appeal.</strong> Residential Tax Appeal prepares this checklist from public county data; we do not
        file anything for you, we are not a law firm, and this is not legal or tax advice. Always check the county&apos;s own instructions.
      </p>

      {plan.warnings.length > 0 && <ul className="notes">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}

      {plan.track !== "not_open" && (
        <>
          <PrintButton />
          <h2>Steps</h2>
          <StepList steps={plan.steps} storageKey={`rta:checklist:${pin}:${plan.track}`} />

          {plan.illustration && <p className="meta">{plan.illustration}</p>}

          {plan.statement && (
            <>
              <h2>Draft explanation</h2>
              <p className="meta">
                A starting point for the explanation field or a signed statement. Edit it, check every number, and sign it yourself.
              </p>
              <pre className="statement">{plan.statement}</pre>
              <p className="no-print"><CopyButton value={plan.statement} label="Copy explanation" /></p>
            </>
          )}
        </>
      )}

      <p className="meta">
        <a href="https://www.cookcountyassessoril.gov/assessment-calendar-and-deadlines">Assessor calendar</a> ·{" "}
        <a href="https://www.cookcountyboardofreview.com/dates-and-deadlines">Board of Review dates</a>
      </p>
    </>
  );
}
