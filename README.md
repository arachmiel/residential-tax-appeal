# Residential Tax Appeal

Helps Cook County, Illinois homeowners check their property assessment and appeal it.

1. **Look up** a property by address or 14-digit PIN.
2. **See history**: assessed values by year (mailed, certified, Board of Review) and Board of Review appeal results.
3. **Know when to act**: the Assessor's and Board of Review's appeal windows for the property's township, from the Assessor's calendar.
4. **Get comparables**: the properties to cite in an appeal, chosen by the uniformity logic in `src/lib/comps.ts`.
5. **Assisted filing**: a step-by-step checklist at `/property/<pin>/file` for whichever window is open (Assessor or Board of Review), with copy buttons for the PIN and comps, a draft explanation, and the deadline. **The homeowner files; we never file for them.**

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
| `npm run sync:calendar` | Refreshes appeal dates from both the Assessor's page and the Board of Review's PDF. Run daily. Each source fails loudly if its layout changes, and one failing doesn't block the other |
| `npm test` / `npm run typecheck` | Unit tests (comps, PIN, calendar parser against a saved real page) / types |

Full-county size (residential classes, default year ranges): assessed values ≈ 5M rows, characteristics ≈ 1M per year, appeals ≈ 2M. Plan on a few GB of Postgres.

## Data sources
| Data | Dataset |
|---|---|
| Assessed values | `uzyt-m557` |
| Property addresses | `3723-97qp` (situs address only; owner/mailing fields are never requested) |
| Characteristics | `x54s-btds` (current; the older `bcnq-qi2z` is archived) |
| Board of Review appeals | `7pny-nedm` (appellant and attorney fields are never stored) |
| Assessor appeal calendar | https://www.cookcountyassessoril.gov/assessment-calendar-and-deadlines (HTML, parsed by `src/lib/calendar.ts`) |
| Board of Review schedule | https://www.cookcountyboardofreview.com/dates-and-deadlines links a one-page PDF (parsed by `src/lib/bor.ts`). Authoritative for Board of Review dates; it lists townships (in hearing groups) before the Assessor's page does. Townships it doesn't list yet have no Board of Review dates published. |

## How comps work
`ratio = building assessed value ÷ building sq ft`. The Assessor's 2026 appeal guidelines say comps should be chosen for what they share with the subject (proximity, size, age, exterior, basement, land, garage) and **not** cherry-picked as the lowest-valued properties. So selection has two steps (`src/lib/comps.ts`):

1. **Eligibility.** Same township, neighborhood, class and exterior wall; single-card, single-parcel PIN; building size within ±20% and land within ±30% of the subject; age within ±5/10/15 years (narrowest that works); and at least $1/sq ft **lower** than the subject.
2. **Ranking.** Among the eligible, the **most similar** win (weighted distance over the seven factors), not the lowest ratio.

Appeal 1 (Assessor) compares **mailed** values; the Board of Review compares **certified** values.

### Tuning results
Reproduce exactly with `npm run compare -- --township=<code> --sample=300` (a deterministic pseudo-random sample across the whole township). Samples of 80 homes proved too noisy: River Forest's full-set rate ranged from 29 to 42 of 80 across different samples.

| Township (300 homes) | Full set of 6 | Partial | None | Median miles to comps | Median $/sf below subject |
|---|---|---|---|---|---|
| Maine (22) | 158 (53%) | 75 | 67 | 0.27 mi (0.49 if lowest-ratio wins) | $1.97 ($3.28) |
| River Forest (33) | 123 (41%) | 109 | 68 | 0.22 mi (0.26) | $2.96 ($3.78) |

Ranking by similarity instead of lowest ratio gives closer, more similar comps at the cost of a smaller ratio gap, i.e. a more defensible but less aggressive argument. Coverage is identical under both policies because eligibility is identical; only the choice among eligible properties differs. An early test on a non-random sample suggested the old absolute size windows (±294 sq ft / ±1,242 sq ft) were the binding constraint, which is why tolerances are now percentages; that comparison was not repeated on a random sample.

## Assisted filing checklist
Built from the county's published instructions (Assessor "File an Appeal Online" page and 2026 Appeal Guidelines; Board of Review residential pages). Logic lives in `src/lib/filing.ts` and is unit-tested; the UI is thin.

- **Only when a window is open.** Otherwise it shows when the window opens or closed, with no link to a filing form (the Assessor warns that a file started early may be deleted).
- **Right basis for the right window.** Assessor appeals compare mailed values; Board of Review appeals compare certified values.
- **Not for everyone.** If a property is assessed **at or below the median of its similar properties**, the checklist says a comparables appeal is unlikely to help, and drafts no explanation, shows no "saving" and suggests no comps. (Without this gate, a below-median home was being told to file with a statement claiming it was over-assessed.)
- **Progress is kept in the browser only** (localStorage). Nothing about the user is stored server-side; there are no accounts yet.
- **Board of Review steps come from the former site's walkthrough** (account, Submit Appeal, "Property Over Assessment", Associated PINs = No, hearing question, purchase-year dropdown, comps on the Notes page, confirm/initial/submit) plus the Board's account-registration page. The portal itself could not be reached from our environment, so these screens have not been re-checked and may have changed; the checklist says so. The Board of Review notes list **4** comps (`BOR_NOTES_COMPS`), as the former instructions did; confirm against the live portal.
- **Assessor steps are less detailed** than the Board's: they follow the Assessor's published steps, because that walkthrough lives in a video we could not read. Add the screen-by-screen steps when available.
- The Assessor's filing system is run by Tyler Technologies (`propertytaxfilings.cookcountyil.gov`); the checklist links to its residential filing for the filing year.
- The old site's mail-in-form rounds are gone: both bodies now take online filings (the Board also accepts a mailed or delivered complaint form).

## Open questions
- **Tolerances and weights are tuned for coverage and similarity, not outcomes.** There is no dataset of which comps were submitted, so we can't measure which settings win appeals. Tested on one township only. Track results as customers appeal.
- **About 1 in 6 homes get no comps**, typically because similar properties aren't assessed lower (already uniform) or the property is atypical. The page says so instead of forcing weak comps.
- **Legal (get advice before launching or charging).** The Board of Review states that "a consultant MAY NOT represent a homeowner at the BOR," and that LLC- or corporation-owned property must be appealed by an attorney. The checklist is built so the homeowner files for themselves and says so, but whether a paid service that prepares comps and a draft statement stays on the right side of that line is a question for an Illinois attorney. Filing on someone's behalf or automating the county portals is out of scope.
- **Product.** Which parts are free vs. paid, and accounts/payments, are not designed yet.
- **Appeal strength isn't graded.** A home slightly above its median and one far above it get the same checklist. Consider showing how strong the case is.
- **Not built yet:** address autocomplete, email alerts, auth, payments, deployment.
