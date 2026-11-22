# Deploying Residential Tax Appeal

This guide targets **Hostinger Business web hosting** for the app plus an **external managed Postgres** for the data.
Hostinger's Business and Cloud plans can run a Node.js app but offer only MySQL; this app needs Postgres (see "Why not
Hostinger's database" below). Shared hosts without Node.js (for example DreamHost shared hosting or Hostinger Premium) cannot
run it.

> **What is verified and what is not.** The app, the password gate and the `/api/health` self-test were tested locally.
> We could **not** test Hostinger itself. Their docs do not say whether a Node.js app on a Business plan can connect to an
> *outside* database, or which Node versions are available. Step 4 finds that out in minutes. Hostinger's own pages are the
> source of truth for button names; links are at the end.

## The pieces

| Piece | Where | Notes |
|---|---|---|
| The website (Next.js) | Hostinger Business (Node.js web app) | Needs Node **20.9 or newer** (we develop on 22) |
| The database (Postgres) | A managed Postgres such as Neon or Supabase | Private to the app. Several GB for the whole county |
| Daily appeal-date sync | GitHub Actions (`sync-calendar.yml`) | Uses the `DATABASE_URL` secret |
| Loading county data | GitHub Actions (`load-data.yml`), run by hand | Start with one township |
| Domain name | Wherever your DNS lives | Use a subdomain (for example `new.`) while testing |

## Steps

### 1. Create the database
Create a Postgres database with a managed provider. Copy its **connection string** (a "pooled" one if offered; most
providers append `?sslmode=require`, keep that). Treat it like a password.

### 2. Give GitHub the connection string
In the GitHub repository: *Settings → Secrets and variables → Actions → New repository secret*:

- `DATABASE_URL` = the connection string from step 1
- `COOK_COUNTY_API_APP_TOKEN` = your Socrata app token (optional; avoids throttling)

Never paste these into chat, issues or code.

### 3. Load a small township first
*Actions → Load county data → Run workflow.* Enter a township code, for example `22` (Maine), leave the rest as is.
It creates the tables, loads that township and syncs the appeal calendar. Check it finishes green. Run it again with the
township field empty for the whole county only once everything else works (large and slow).

### 4. Create the site on Hostinger and run the self-test
Follow Hostinger's guide to deploy a Node.js app from a GitHub repository (links below), with:

- **Repository:** this one, branch `main`
- **Node version:** the newest available, at least 20.9 (22 preferred)
- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Environment variables** (in Hostinger's panel):
  - `DATABASE_URL` = the same connection string
  - `SITE_PASSWORD` = a password of your choosing. **Turns on a login for the entire site.** Keep it on until you are ready to launch
  - `PGPOOL_MAX` = `5` (optional)

Then open `https://<your-site>/api/health` (your browser will ask for the password; any user name works).

| What you see | Meaning | What to do |
|---|---|---|
| `"ok": true`, row counts, `node` version | Everything works | Go to step 5 |
| `503`, `"code": "ETIMEDOUT"` or `"ECONNREFUSED"` | The host cannot reach the database (blocked outbound connections, or the database blocks the host) | Check the provider's allowed-IP settings. If Hostinger blocks outbound database connections on your plan, use a VPS or move the app to a platform that allows it |
| `503`, `"code": "ENOTFOUND"` | Wrong database address in `DATABASE_URL` | Re-copy the connection string |
| `503`, "tables are missing" | Connected, but no data yet | Run step 3 |
| `503`, `"code": "DATABASE_URL_NOT_SET"` | Environment variable missing | Add it in Hostinger's panel and redeploy |
| `401` | The password gate is working | Enter the `SITE_PASSWORD` |
| Build fails with a Node error | Node version too old | Select Node 20.9 or newer |

### 5. Point a subdomain at it
Add the DNS record Hostinger tells you to (usually a CNAME or A record) wherever your domain's DNS is managed, for a
subdomain such as `new.residentialtaxappeal.com`. **Do not change the main domain** until you are ready to launch: it may
still serve your current site.

### 6. Before removing the password and going public
- [ ] Get legal advice (Illinois). The Board of Review says "a consultant MAY NOT represent a homeowner at the BOR" and that
      LLC- or corporation-owned property needs an attorney. See the README's open questions.
- [ ] Walk through a real Assessor and Board of Review filing and fix any checklist step that differs from the live screens.
      Confirm the portal accepts the generated Excel comps file.
- [ ] Rotate the credentials that were in the old repository (see the README) and use new ones here.
- [ ] Load the whole county, check `/api/health`, and confirm the daily sync workflow is green.
- [ ] Decide what is free and what is paid, and add accounts or payments if needed.
- [ ] Remove `SITE_PASSWORD` only when all of the above is done.

## Why not Hostinger's database?
Hostinger's Business and Cloud plans include MySQL, not Postgres. The app's data layer uses Postgres features (trigram address
search, bulk JSON loading), so it cannot simply run on MySQL. Hostinger VPS plans can run Postgres, but then you manage the
server (updates, security, backups).

## Backups
Use your managed database's backups (turn them on and test a restore). The data is public county data and can be reloaded, but
the load takes hours.

## Hostinger references
- Node.js hosting options: https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/
- Selecting the Node.js version: https://www.hostinger.com/support/how-to-select-the-node-js-version-for-your-application/
- Node.js limits for Web and Cloud plans: https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/
- Plan limits table: https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/
