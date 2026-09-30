# D365 Process Catalogue (BPM)

iCatalyst's catalogue of Dynamics 365 business processes, with per-client scoping.
Single-page React app (Vite) plus a small API (Cloudflare Pages Functions + D1).

**Live site:** https://icatalyst-catalogue.pages.dev

## Views

- **Client view** (default): Finance and Operations only.
- **iCatalyst view**: open `?view=icatalyst` once (remembered per browser); `?view=client` switches back.
  This is a convenience, not access control.

## Client projects

1. In the iCatalyst view, click **Projects**, paste the iCatalyst key, and create a project.
2. Send the client their **client link** (`/?project=<slug>`). Anyone with the link can edit that project's scoping.
3. Clients set scope (in / later / out), priority, process owner and notes on L3 processes and L4 scenarios.
   Scenarios follow their process's scope unless overridden.
4. iCatalyst sets **fit/gap** (standard, configuration, extension, ISV, gap). The API only accepts fit/gap
   changes carrying the iCatalyst key (`VENDOR_KEY` secret).
5. **Scope summary** shows progress by end-to-end process and exports:
   - decisions as CSV (opens in Excel);
   - an Azure DevOps CSV import (Epic = L1, Feature = L2, User Story = in-scope L3).

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
