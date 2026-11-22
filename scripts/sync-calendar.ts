/** Fetch the assessor's appeal calendar page and upsert it. Run daily. */
import { Pool } from "pg";
import { parseCalendar } from "../src/lib/calendar";

const URL = "https://www.cookcountyassessoril.gov/assessment-calendar-and-deadlines";

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": "ResidentialTaxAppeal/0.1 (+calendar sync, once daily)" } });
  if (!res.ok) throw new Error(`Calendar page returned HTTP ${res.status}`);
  const entries = parseCalendar(await res.text());
  // Fail loudly rather than silently wiping good data if the page layout changes.
  if (entries.length < 30) throw new Error(`Parsed only ${entries.length} townships; the page layout probably changed.`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const e of entries) {
      await pool.query(
        `insert into appeal_calendar (year, region, township, notice_date, last_file_date, a_roll_certified, a_roll_published, bor_start, bor_end, pass, status_text, fetched_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
         on conflict (year, township) do update set region=$2, notice_date=$4, last_file_date=$5, a_roll_certified=$6,
           a_roll_published=$7, bor_start=$8, bor_end=$9, pass=$10, status_text=$11, fetched_at=now()`,
        [e.year, e.region, e.township, e.noticeDate, e.lastFileDate, e.aRollCertified, e.aRollPublished, e.borStart, e.borEnd, e.pass, e.statusText],
      );
    }
    console.log(`Synced ${entries.length} townships.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
