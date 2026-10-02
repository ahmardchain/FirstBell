# FirstBell Binance server comparison

An isolated Node.js service for Binance support case **170818889**. It runs the same two read-only NVDAon/BSC 56 requests as `node scripts/check-binance-market.mjs`: candles (15m, limit 100), then price-info. The CLI and hosted test import the same checker. It does not replace FirstBell's Cloudflare Worker or forward its live traffic.

## Deploy a new Vercel project

1. Import `ahmardchain/FirstBell` into a **new** project named `firstbell-binance-test`.
2. Set **Root Directory** to `server-test`, **Framework Preset** to **Other**, and Node.js to **24.x**. The included config uses the `public` output directory, no install/build command, a 30-second function duration and one configured region, **Frankfurt (`fra1`)**.
3. Add these environment variables for the deployment target, using the same Binance Web3 credential pair that succeeded locally:

   | Variable | Value |
   | --- | --- |
   | `BINANCE_WEB3_API_KEY` | Binance Web3 API Key |
   | `BINANCE_WEB3_SECRET_KEY` | Its matching Secret Key |
   | `BINANCE_TEST_TOKEN` | A new random access token, 32–128 letters, digits, underscores or hyphens |

   Generate the test access token with a password manager or `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it private; it gates only this read-only diagnostic. Never put the Binance credentials into source, URLs, the page form, chat or Git. Cloudflare secrets do not automatically transfer to Vercel.
4. Deploy. Keep Vercel deployment protection enabled where available. After changing environment variables, redeploy so the function receives them.
5. Open the new project URL. Enter **only the test access token** and click **Run server test**. Copy the displayed JSON report for comparison with the local and Worker results. The form clears the access token and does not store it in the browser.

The [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js) supports the function's standard `fetch(Request)` handler. [Region configuration](https://vercel.com/docs/functions/configuring-functions/region) supports a single selected region on Hobby. Frankfurt is a chosen test location, **not** a Binance-approved region or a guaranteed static outgoing IP. The `hosting` object separates configured region from the runtime's optional region label; neither is the source IP seen by Binance.

## Read the result

- `result: "both_accepted"`: both upstream responses returned HTTP success/code 0. Check each `itemCount`; zero items do not prove usable prices or candles.
- `providerCode: 40304`: Binance still reports a compliance restriction on that request. [Binance's code definition](https://web3.binance.com/en/dev-docs/products/defi-api/error-codes) does not identify the specific rule or prove an IP allowlist problem.
- `result: "network_error"`: no usable provider result was obtained; do not label this a Binance compliance response.
- A successful test service HTTP 200 is separate from each Binance request's HTTP status and business code.

Save both request timestamps, endpoint paths, partial key identifier, statuses, messages and item counts. Ask Binance to confirm the source IP and applicable rule using its own request logs. A different host succeeding helps narrow the diagnosis; it does not establish a general approved hosting policy. Resolve compliance with Binance before routing production traffic.

## Access and scope

The function is disabled unless all three server values are configured. It requires the test access token in an Authorization header and never accepts arbitrary upstream URLs or query parameters. It returns bounded, redacted diagnostics, omitting full Binance keys, signatures, nonces, raw provider data and exception strings. Reports use `Cache-Control: no-store`. A per-process 20-second cooldown limits repeated clicks but is not a global rate-limit guarantee. Rotate or remove the test token and remove the deployment when the support comparison is complete.

Validate from the parent repository with `node --test tests/binance-local-check.test.mjs tests/binance-server-test.test.mjs`. These tests mock Binance; they do not establish live hosting acceptance. There are no added npm dependencies, wallet calls, order endpoints or payments.

## Observed hosted comparison

On 2026-10-02 the builder deployed a separate `firstbell-server-test` project and supplied its report, started at `19:21:50.567Z`. Both configured and reported runtime regions were `fra1`. Candles returned HTTP 200/code 0 with 100 entries in 375 ms; price-info returned HTTP 200/code 0 with one entry in 248 ms. This is builder-provided live evidence, not a request independently observed by the agent. It establishes acceptance of these two requests on that deployment, not the freshness or validity of the omitted market data, a general hosting policy, or a connected FirstBell chart. See the [evidence log](../docs/developer-experience-report.md) for the timestamps and comparison limits.

Initial automatic deployment review rejected the connected unrelated Vercel target; no deployment was made there. Later connector access to the builder's new project was denied, and the browser required Vercel sign-in. The builder supplied the successful report before that sign-in completed. This service still returns diagnostics only; production market routing has not been enabled.
