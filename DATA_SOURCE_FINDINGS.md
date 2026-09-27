# Snapshot chart data: phase 0 findings

Checked 27 September 2026.

## Result

The app is ready to render a deterministic snapshot chart, but automatic public OHLC publication is not enabled. No verified, documented automated route from the embedded TradingView widget to `PEPPERSTONE:XAUUSD` M5/M15/H1 candles was found, and permission to republish a user's Supercharts CSV on this public site has not been established.

Therefore current and historical reports without `chartPlan` show an explicit fallback while preserving the TradingView market widget, written analysis, price-map PNG, news, journal, history, and push notification.

## Evidence

- TradingView documents widgets as hosted iframe objects containing TradingView data, while libraries require the publisher's own data feed: https://www.tradingview.com/free-charting-libraries/
- TradingView's widget data FAQ says widget data cannot be exported and no data API is offered: https://www.tradingview.com/widget-docs/faq/data/
- TradingView documents manual CSV download from Supercharts after the required chart data is loaded: https://www.tradingview.com/support/solutions/43000537255-how-to-export-chart-data/
- Lightweight Charts is Apache 2.0 and requires its attribution notice/link. The app enables the built-in TradingView attribution logo: https://github.com/tradingview/lightweight-charts

## Production gate

Before adding `chartPlan` to a real report, establish all of the following:

1. The data is an auditable direct export for exact symbol `PEPPERSTONE:XAUUSD` and the requested timeframe.
2. Timezone and bar-open timestamps are known and converted to UTC epoch seconds without guessing.
3. Every included candle is closed at `snapshotAt`; missing periods remain gaps.
4. The source terms permit publishing the exported OHLC data in this public GitHub repository and Pages site.
5. The report and all dataset files pass `scripts/validate-report.mjs` together.

Do not use undocumented endpoints, chart OCR, another broker, or Pepperstone data from a different platform as an implicit substitute.
