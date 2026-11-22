# Residential Tax Appeal

Helps Cook County, Illinois homeowners check their property assessment and appeal it.

1. **Look up** a property by address or 14-digit PIN.
2. **See history**: assessed values by year (mailed, certified, Board of Review) and Board of Review appeal results.
3. **Know when to act**: the Assessor's and Board of Review's appeal windows for the property's township, from the Assessor's calendar.
4. **Get comparables**: the properties to cite in an appeal, chosen by the uniformity logic in `src/lib/comps.ts`.
5. **Assisted filing** (not built yet): a prefilled checklist and generated mail-in forms. The homeowner files; we do not file for them.

## Stack
Next.js (App Router, TypeScript) + Postgres. Data comes from the Cook County open-data portal (Socrata) and the Assessor's calendar page. No scraping of per-property pages, and no logins are needed.

## Run locally
```bash
npm install
docker compose up -d            # or point DATABASE_URL at any Postgres 14+
cp .env.example .env.local
npm run db:migrate
npm run load -- --township=33   # River Forest only, ~30s. Omit --township for the whole county (large, see below)
npm run sync:calendar
npm run dev
```

| Script | What it does |
|---|---|
| `npm run db:migrate` | Applies `db/schema.sql` (idempotent) |
| `npm run load` | Bulk-loads assessed values, addresses, characteristics and Board of Review appeals. Flags: `--only=<dataset>`, `--from-year=<yyyy>`, `--township=<code>` |
| `npm run sync:calendar` | Parses the Assessor's calendar page. Run daily. Fails loudly if the page layout changes |
| `npm test` / `npm run typecheck` | Unit tests (comps, PIN, calendar parser against a saved real page) / types |

Full-county size (residential classes, default year ranges): assessed values ≈ 5M rows, characteristics ≈ 1M per year, appeals ≈ 2M. Plan on a few GB of Postgres.

## Data sources
| Data | Dataset |
|---|---|
| Assessed values | `uzyt-m557` |
| Property addresses | `3723-97qp` (situs address only; owner/mailing fields are never requested) |
| Characteristics | `x54s-btds` (current; the older `bcnq-qi2z` is archived) |
| Board of Review appeals | `7pny-nedm` (appellant and attorney fields are never stored) |
| Appeal calendar | https://www.cookcountyassessoril.gov/assessment-calendar-and-deadlines (HTML, parsed) |

## How comps work
`ratio = building assessed value ÷ building sq ft`. A comparable is in the same township, neighborhood, class and exterior wall, is a single-card/single-parcel PIN, is similar in age, building size and land size, and is at least $1/sq ft lower than the subject. The lowest ratios win. Appeal 1 (Assessor) compares **mailed** values; the Board of Review compares **certified** values.

## Open questions
- **Tolerances are unvalidated.** The size and land windows (±294 sq ft, ±1,242 sq ft) and the age steps were inherited from the old site's SQL. On a sample of real River Forest homes, few got a full set of 6 comps (details in the PR/commit notes). Tune them against real appeal outcomes before relying on them.
- **Legal.** Filing on someone's behalf may be unauthorized practice of law in Illinois, and automating the county's portal may breach its terms. Get legal advice before building anything beyond assisted filing.
- **Product.** Which parts are free vs. paid, and accounts/payments, are not designed yet.
- **Not built yet:** address autocomplete, email alerts, assisted-filing checklist and PDF generation, auth, deployment.
