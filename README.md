# XAU Desk

A Thai-language XAU/USD market workspace built as a PWA. GitHub Pages hosts the app and public chart images; a Cloudflare Worker stores analysis history and device subscriptions in D1, then sends encrypted Web Push alerts.

## Included

- Pepperstone XAU/USD TradingView chart and links to Forex Factory and SPDR holdings.
- An optional snapshot plan chart with verified closed candles, entry zone, structural stop state, and targets. Reports without a publishable OHLC dataset use an explicit fallback.
- Scheduled-report view and a review log.
- PWA installation and per-device notification opt-in.
- Cloudflare Worker API and D1 storage for subscriptions and report history.
- GitHub Actions workflow that deploys Pages first, then stores changed reports and sends push alerts.

## Local development

Run npm ci, then npm run dev from the repository root.

Create worker/.dev.vars for local Worker development. Never commit secrets.

    REPORT_TOKEN=replace-with-a-local-secret
    VAPID_PUBLIC_KEY=replace-with-public-vapid-key
    VAPID_PRIVATE_KEY=replace-with-private-vapid-key

## Cloudflare setup

From worker/, install dependencies, log in with Wrangler, create the D1 database, and apply the migration. Deploy after configuring secrets.

Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and REPORT_TOKEN with Wrangler secret put. The public key and report API URL are public configuration; the private VAPID key and report token must remain secret. The setup script generates the keys and stores the private values directly in Cloudflare and GitHub Actions without printing them.

## GitHub configuration

The repository Actions secret XAU_REPORT_TOKEN must match the Worker secret. The repository variable XAU_WORKER_URL points to the deployed Worker. Configure the Pages source as GitHub Actions.

## Publish a scheduled report

Write a report JSON, render a number-accurate image from that same JSON, then publish both:

    node scripts/render-analysis-image.mjs --input C:\path\to\latest.json --output C:\path\to\latest.png
    .\scripts\publish-report.ps1 -ReportPath C:\path\to\latest.json -ImagePath C:\path\to\latest.png

The report validator requires `snapshotAt`, `status`, `headline`, `summary`, `bias`, `entryZone`, `trigger`, `invalidation`, `stop`, `targets`, `riskReward`, `newsRisk`, `body`, and `sources`. Structured plan review, news, data-quality, price-map, and snapshot-chart fields are documented in `SCHEDULE_WORKFLOW.md`.

If a report includes `chartPlan`, provide a directory containing its verified `M5.json`, `M15.json`, and/or `H1.json` files and publish with:

    .\scripts\publish-report.ps1 -ReportPath C:\path\to\latest.json -ImagePath C:\path\to\latest.png -ChartDataDirectory C:\path\to\chart-data

The publish script adds a dated image URL and stores each snapshot dataset under its immutable `snapshotKey`. GitHub Pages deploys the report and assets first; its workflow then stores the analysis in the Worker and sends push alerts. This repository is public, so reports and chart data must not contain personal details or secrets.
