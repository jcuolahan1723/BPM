# D365 Process Catalogue (BPM)

iCatalyst's catalogue of Dynamics 365 business processes, with per-client scoping.
Single-page React app (Vite) plus a small API (Cloudflare Pages Functions + D1).

**Live site:** https://icatalyst-catalogue.pages.dev

## Views

- **Client view** (default): Finance and Operations only.
- **iCatalyst view**: open `?view=icatalyst` once (remembered per browser); `?view=client` switches back.
  This is a convenience, not access control.

## Master library and custom processes

- **Master library** (Projects → Open master library; iCatalyst key needed): iCatalyst processes and
  scenarios added on top of Microsoft's catalogue, plus default decisions (scope, fit/gap, notes).
  Codes carry an `i`: a process under area 10.05 is `10.05.i010.000`; a scenario under process
  10.05.080 is `10.05.080.i010`.
- **New client projects start from a copy of the master.** Later master changes don't flow into existing
  projects; each client keeps the version it started with.
- **Clients add their own processes and scenarios**, coded with their initials (2–4 letters, set when the
  project is created and fixed afterwards), e.g. `10.05.ACM010.000`. Clients can edit and remove what they
  added; library items in their project can only be changed by iCatalyst.
- Exports show each item's source: Microsoft, iCatalyst library, or client-specific.

## Client projects

1. In the iCatalyst view, click **Projects**, paste the iCatalyst key, and create a project (name + initials).
2. Send the client their **client link** (`/?project=<slug>`). Anyone with the link can edit that project's scoping.
3. Clients set scope (in / later / out), priority, process owner and notes at any level. Lower levels
   follow the nearest decision above them unless overridden.
4. iCatalyst sets **fit/gap** (standard, configuration, extension, ISV, gap). The API only accepts fit/gap
   changes carrying the iCatalyst key (`VENDOR_KEY` secret).
5. **Scope summary** shows progress by end-to-end process and exports:
   - decisions as CSV (opens in Excel);
   - an Azure DevOps CSV import (Epic = L1, Feature = L2, User Story = in-scope L3).

## Refresh the Microsoft catalogue

1. Download the latest Business Process Catalog spreadsheet from https://aka.ms/BusinessProcessCatalog
   and put it in this folder (spreadsheets are not committed).
2. Run `npm run import-catalogue -- "Std Business Process Catalog MMM YYYY.xlsx"`.
   This rewrites `src/catalogue-data.js` and prints totals, links found, and anything it left out
   (deprecated rows, duplicate IDs, items whose parent is missing).
3. Check `git diff --stat`, try the site locally, then `npm run deploy`.

The version shown in the app (e.g. "MAR 2026") comes from the spreadsheet file name.
Client project decisions are keyed by process code, so they carry over to a new catalogue version;
decisions on codes Microsoft removes stay in the database but no longer appear.

## Develop and deploy

```
npm install                  # first time only
npm run dev                  # UI only (no API)
npm run build && npx wrangler pages dev   # UI + API with a local database
npm run deploy               # build and publish
```

Local API testing needs a `.dev.vars` file containing `VENDOR_KEY=<any value>` (not committed), and
`npx wrangler d1 migrations apply icatalyst-catalogue --local` once.

Database changes go in `migrations/`; apply to production with
`npx wrangler d1 migrations apply icatalyst-catalogue --remote`.

## Process diagrams

Put a diagram in `public/diagrams/`, named with the process's L3 code, for example `75.50.090.000.png`.
The app shows one diagram per L3 process.

> Previously hosted on Azure Static Web Apps; moved to Cloudflare Pages in September 2026.
