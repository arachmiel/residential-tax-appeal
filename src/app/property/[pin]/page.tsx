import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appealStage, type AppealStage, type CalendarEntry } from "@/lib/calendar";
import { formatPin, normalizePin } from "@/lib/pin";
import { getBorAppeals, getCalendarForTownship, getComps, getProperty, getValueHistory, type CalendarRow } from "@/lib/queries";
import { money, niceDate, num, perSf, todayIso } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pin: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const pin = normalizePin((await params).pin);
  return { title: pin ? `PIN ${formatPin(pin)}` : "Property" };
}

function toEntry(r: CalendarRow): CalendarEntry {
  return {
    year: r.year, region: r.region, township: r.township, noticeDate: r.notice_date, lastFileDate: r.last_file_date,
    aRollCertified: r.a_roll_certified, aRollPublished: r.a_roll_published, borStart: r.bor_start, borEnd: r.bor_end,
    pass: r.pass, statusText: r.status_text ?? "",
  };
}

function StageBanner({ stage, e }: { stage: AppealStage; e: CalendarEntry }) {
  switch (stage) {
    case "assessor_open":
      return (
        <div className="banner open">
          <strong>Your township is open for Assessor appeals</strong>
          File by {niceDate(e.lastFileDate)}. <a href="https://www.cookcountyassessoril.gov/online-appeals">File online with the Assessor</a>
        </div>
      );
    case "bor_open":
      return (
        <div className="banner open">
          <strong>The Board of Review is open for your township</strong>
          Appeals accepted {niceDate(e.borStart)} – {niceDate(e.borEnd)}.
        </div>
      );
    case "upcoming":
      return (
        <div className="banner warn">
          <strong>Opens {niceDate(e.noticeDate)}</strong>
          Your township&apos;s Assessor appeal window starts after the reassessment notice is mailed.
        </div>
      );
    case "between":
      return (
        <div className="banner warn">
          <strong>Assessor appeals closed {niceDate(e.lastFileDate)}</strong>
          {e.borStart ? `Board of Review appeals open ${niceDate(e.borStart)} – ${niceDate(e.borEnd)}.` : "Board of Review dates have not been published yet."}
        </div>
      );
    case "closed":
      return (
        <div className="banner closed">
          <strong>Appeals are closed for your township this year</strong>
          Assessor deadline was {niceDate(e.lastFileDate)}; Board of Review ended {niceDate(e.borEnd)}.
        </div>
      );
    default:
      return (
        <div className="banner warn">
          <strong>No appeal dates published yet for your township</strong>
          We check the Assessor&apos;s calendar every day.
        </div>
      );
  }
}

export default async function PropertyPage({ params }: Params) {
  const pin = normalizePin((await params).pin);
  if (!pin) notFound();

  const prop = await getProperty(pin);
  if (!prop) notFound();

  const [history, appeals, calRow] = await Promise.all([
    getValueHistory(pin),
    getBorAppeals(pin),
    prop.townshipName ? getCalendarForTownship(prop.townshipName) : Promise.resolve(null),
  ]);

  const entry = calRow ? toEntry(calRow) : null;
  const stage = entry ? appealStage(entry, todayIso()) : null;
  // Assessor appeals compare MAILED values; once the roll is certified the Board of Review compares CERTIFIED values.
  const basis = stage === "bor_open" || (stage === "closed" && entry?.aRollCertified) ? "certified" : "mailed";
  const comps = await getComps(pin, basis).catch(() => null);

  return (
    <>
      <p className="meta"><Link href="/">← New search</Link></p>
      <h1>{prop.address ?? `PIN ${formatPin(pin)}`}</h1>
      <p className="meta">
        PIN {formatPin(pin)} · {[prop.city, prop.zip].filter(Boolean).join(" ")} · {prop.townshipName} township · class {prop.propClass}
        {prop.yearBuilt ? ` · built ${prop.yearBuilt}` : ""}{prop.bldgSf ? ` · ${num(prop.bldgSf)} sq ft` : ""}
      </p>

      <h2>Appeal window</h2>
      {entry && stage ? <StageBanner stage={stage} e={entry} /> : <div className="banner warn">We don&apos;t have calendar data for this township yet.</div>}

      <h2>Assessment history</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Year</th><th className="n">Initial (mailed)</th><th className="n">After Assessor appeal (certified)</th><th className="n">After Board of Review</th></tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.year}>
                <td>{h.year}</td>
                <td className="n">{money(h.mailed_tot)}</td>
                <td className="n">{money(h.certified_tot)}</td>
                <td className="n">{money(h.board_tot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">Assessed values are 10% of market value for residential property. A certified value lower than the mailed value means an Assessor appeal or correction reduced it.</p>

      <h2>Appeal history</h2>
      {appeals.length === 0 ? (
        <p className="meta">No Board of Review appeals on record for this PIN.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Year</th><th>Type</th><th className="n">Assessor value</th><th className="n">Board value</th><th>Result</th></tr></thead>
            <tbody>
              {appeals.map((a, i) => (
                <tr key={`${a.tax_year}-${i}`}>
                  <td>{a.tax_year}</td><td>{a.appeal_type_description ?? "—"}</td>
                  <td className="n">{money(a.assessor_total_value)}</td><td className="n">{money(a.bor_total_value)}</td><td>{a.result ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Comparable properties</h2>
      {!comps ? (
        <p className="meta">We can&apos;t compare this property: it&apos;s missing building size or value data.</p>
      ) : (
        <>
          <div className="card stat">
            <div><b>{perSf(comps.result.subjectRatio)}</b>your building value per sq ft ({basis}, {comps.valueYear})</div>
            <div><b>{perSf(comps.result.medianRatio)}</b>median of {num(comps.result.groupSize)} similar properties</div>
            <div><b>{num(comps.result.paysMoreThan)} of {num(comps.result.groupSize)}</b>similar properties are assessed lower per sq ft</div>
          </div>
          {comps.result.warnings.length > 0 && (
            <ul className="notes">{comps.result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          {comps.result.comps.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>#</th><th>Address</th><th>PIN</th><th className="n">$/sq ft</th><th className="n">Built</th><th className="n">Sq ft</th></tr></thead>
                <tbody>
                  {comps.result.comps.map((c, i) => (
                    <tr key={c.pin}>
                      <td>{i + 1}</td><td>{c.address ?? "—"}</td><td>{formatPin(c.pin)}</td>
                      <td className="n">{perSf(c.ratio)}</td><td className="n">{c.yearBuilt ?? "—"}</td><td className="n">{num(c.bldgSf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
