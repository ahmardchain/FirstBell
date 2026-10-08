# Vercel compatibility layout and protected comparison

This folder is **still used** by FirstBell's existing Vercel project. It supports Root Directory `server-test` while building the full app from the repository root. Do not delete it as an obsolete diagnostic directory.

`vercel.json` runs the parent install/build/tests and `scripts/stage-vercel-app.mjs` stages the landing page, `/app/`, static assets and bundled API into this layout. `api/index.mjs` is regenerated from the shared API during `npm run build`. See the current [deployment guide](../docs/vercel-deployment.md).

## Optional protected comparison

The original read-only comparison is retained at `/server-test.html` and `/api/check`. It checks NVDAon BSC candles and price-info through the same request-signing contract as `scripts/check-binance-market.mjs`. It does not sign wallets, quote orders or move funds.

The comparison requires server `BINANCE_WEB3_API_KEY`, its matching `BINANCE_WEB3_SECRET_KEY`, and a private `BINANCE_TEST_TOKEN`. Enter the test token only in the comparison UI; never put its value in a URL or repository. Missing configuration disables the diagnostic. Results omit full keys, signatures, nonces and raw provider data.

An HTTP 200 from the comparison route does not establish Binance success: inspect each upstream status, business code and returned item count. Accepted API calls do not establish usable candles, a universal hosting policy or stock execution. Historic observations remain in the [firsthand field log](../docs/developer-experience-report.md).

For a local read-only comparison without deploying this package, use Node 24 and `node scripts/check-binance-market.mjs` from the root. Regression checks are `node --test tests/binance-local-check.test.mjs tests/binance-server-test.test.mjs`; their upstream requests are fixtures.
