# D365 Process Catalogue (BPM)

iCatalyst's catalogue of Dynamics 365 business processes. It's a single-page React app built with Vite.

**Live site:** https://icatalyst-catalogue.pages.dev (Cloudflare Pages)

## Update the site

```
npm install        # first time only
npm run deploy     # builds and publishes to Cloudflare Pages
```

`npm run dev` runs the app locally.

## Process diagrams

Put a diagram in `public/diagrams/`, named with the process's L3 code, for example `75.50.090.000.png`.
The app shows one diagram per L3 process.

> Previously hosted on Azure Static Web Apps; moved to Cloudflare Pages in September 2026.
