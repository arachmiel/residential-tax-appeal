/**
 * Refresh appeal dates from the two official sources. Run daily.
 *   1. Assessor: HTML calendar page  (src/lib/calendar.ts)
 *   2. Board of Review: schedule PDF (src/lib/bor.ts)
 * Each source fails loudly if its layout changes rather than writing partial data. One failing doesn't block the other.
 */
import { Pool } from "pg";
import { findScheduleLink, parseBorSchedule } from "../src/lib/bor";
import { parseCalendar } from "../src/lib/calendar";

const UA = { "User-Agent": "ResidentialTaxAppeal/0.1 (+appeal date sync, once daily)" };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function syncAssessor() {
  const res = await fetch("https://www.cookcountyassessoril.gov/assessment-calendar-and-deadlines", { headers: UA });
  if (!res.ok) throw new Error(`Assessor calendar page returned HTTP ${res.status}`);
  const entries = parseCalendar(await res.text());
  if (entries.length < 30) throw new Error(`Parsed only ${entries.length} townships; the page layout probably changed.`);
  for (const e of entries) {
    await pool.query(
      `insert into appeal_calendar (year, region, township, notice_date, last_file_date, a_roll_certified, a_roll_published, bor_start, bor_end, pass, status_text, fetched_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       on conflict (year, township) do update set region=$2, notice_date=$4, last_file_date=$5, a_roll_certified=$6,
         a_roll_published=$7, bor_start=$8, bor_end=$9, pass=$10, status_text=$11, fetched_at=now()`,
      [e.year, e.region, e.township, e.noticeDate, e.lastFileDate, e.aRollCertified, e.aRollPublished, e.borStart, e.borEnd, e.pass, e.statusText],
    );
  }
  console.log(`Assessor calendar: ${entries.length} townships.`);
}

async function syncBoardOfReview() {
  const page = await fetch("https://www.cookcountyboardofreview.com/dates-and-deadlines", { headers: UA });
  if (!page.ok) throw new Error(`Board of Review dates page returned HTTP ${page.status}`);
  const link = findScheduleLink(await page.text());
  if (!link) throw new Error("Board of Review dates page no longer links the township schedule PDF.");
  const pdf = await fetch(link, { headers: UA });
  if (!pdf.ok) throw new Error(`Board of Review schedule PDF returned HTTP ${pdf.status}`);
  const schedule = await parseBorSchedule(new Uint8Array(await pdf.arrayBuffer()));

  const known = new Set((await pool.query("select lower(township) t from appeal_calendar")).rows.map((r) => r.t as string));
  let n = 0;
  for (const g of schedule.groups) {
    for (const township of g.townships) {
      if (known.size > 0 && !known.has(township.toLowerCase())) console.warn(`  warning: "${township}" is not in the Assessor's calendar; check the spelling.`);
      await pool.query(
        `insert into bor_schedule (year, township, grp, open_date, close_date, evidence_deadline, re_review_open, re_review_close, hearing_dates, fetched_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         on conflict (year, township) do update set grp=$3, open_date=$4, close_date=$5, evidence_deadline=$6,
           re_review_open=$7, re_review_close=$8, hearing_dates=$9, fetched_at=now()`,
        [schedule.year, township, g.group, g.openDate, g.closeDate, g.evidenceDeadline, g.reReviewOpen, g.reReviewClose, g.hearingDates.join(",")],
      );
      n++;
    }
  }
  console.log(`Board of Review schedule: ${n} townships in ${schedule.groups.length} groups (${schedule.year} session).`);
}

async function main() {
  let failed = false;
  for (const [name, fn] of [["Assessor", syncAssessor], ["Board of Review", syncBoardOfReview]] as const) {
    try {
      await fn();
    } catch (e) {
      failed = true;
      console.error(`${name} sync FAILED:`, e instanceof Error ? e.message : e);
    }
  }
  await pool.end();
  if (failed) process.exit(1);
}

main();
