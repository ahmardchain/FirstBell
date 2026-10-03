# Deploy FirstBell to Vercel

The repository supports the full landing page and app on Vercel. Its Node API reuses FirstBell's Binance signing, market validation, Privy authentication and MoonPay handlers. Upstash Redis replaces Cloudflare Durable Objects for saved stocks, deposit sessions and account rate limits. Browser calls remain on the same origin under `/api/`.

The builder's separate diagnostic accepted both Binance NVDAon requests in `fra1` on 2026-10-02. The migration builds a self-contained API in `api/index.mjs` to avoid missing TypeScript imports in Vercel. Live Redis persistence still needs verification. Diagnostic acceptance does not establish usable live candles, account migration, a static outgoing IP or approval of every API operation.

## 1. Use the repository root

The connected `firstbell-server-test` project can keep its existing Root Directory `server-test`. Its checked-in configuration installs/builds the repository root and stages the landing page, `/app/`, and bundled API inside that project. Existing Binance environment values stay in place; the original diagnostic page is retained at `/server-test.html`. Deploy the latest `main` commit. No dashboard Root Directory change is needed for this compatibility path.

For a new project connected to `ahmardchain/FirstBell`, use these repository-root settings:

| Setting | Value |
| --- | --- |
| Root Directory | `.` — repository root, replacing `server-test` |
| Framework Preset | Vite |
| Node.js Version | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run build && node scripts/stage-vercel-diagnostic.mjs` |
| Output Directory | `dist` |

The checked-in Vercel configuration specifies the install/build commands, API routing, both HTML entry points and function region `fra1`. Both project-root layouts retain the diagnostic at `/server-test` and `/api/check`. `npm run build:api` regenerates the committed self-contained API and its copy in the compatibility project; run the build before publishing API changes. The selected region follows the successful diagnostic; it is not a guaranteed source IP or an independently confirmed Binance hosting policy.

## Use one production origin for Privy

The fixed app origin is **https://firstbell-server-test.vercel.app**. The other Vercel app/landing URLs redirect to this origin before login. This keeps Google/email login on one hostname across deployments. Page redirects preserve the route/query, exclude `/api/*`, and only match a host different from the fixed domain. Backend requests and the separate diagnostic remain scoped to their own deployment.

In Privy, select the app used by FirstBell and open **Configuration → App settings → Domains → Allowed Origins**. Add exactly `https://firstbell-server-test.vercel.app`, including HTTPS and without `/app/` or another path. Use that fixed origin when signing in. Verify that Google and email are enabled under Login methods. If an app client overrides Allowed Origins, configure this origin on that client too. Vercel's deployment protection is a separate setting and is not changed by these redirects.

## 2. Set server environment variables

Use **Project → Settings → Environment Variables**. Configure Production, and Preview only if you also want to test a preview deployment. Redeploy after changing values. Reuse the Binance credential pair that succeeded in your server test; never commit the values or paste them into client files.

| Name | Where to get it / purpose |
| --- | --- |
| `BINANCE_WEB3_API_KEY` | Existing Binance Web3 Developer Portal API Key; required for Binance market feeds and route checks |
| `BINANCE_WEB3_SECRET_KEY` | Its matching Secret Key; server signing only |
| `PRIVY_VERIFICATION_KEY` | Optional Privy dashboard **verification public key**, in PEM format. Valid keys verify locally; missing, stale or malformed keys use Privy's app-specific published keys. This is not the Privy App Secret. |
| `UPSTASH_REDIS_REST_URL` | REST endpoint of your persistent Upstash Redis database; required for account features |
| `UPSTASH_REDIS_REST_TOKEN` | Matching read/write REST token; server only |
| `MOONPAY_PUBLISHABLE_KEY` | Optional test publishable key for sandbox card checkout |
| `MOONPAY_SECRET_KEY` | Matching optional MoonPay test signing key |
| `MOONPAY_ENVIRONMENT` | `sandbox` for the hackathon test checkout |
| `LEGACY_ACCOUNTS_ORIGIN` | Optional `https://firstbell.ahmardchain.workers.dev` to import existing account history; see step 3 before enabling the new app |
| `ONDO_API_KEY` | Optional Ondo primary-market fallback and legacy indicative quote service; not needed for Binance charts |

FirstBell defaults to public Privy App ID `cmun7bqhg00070ck6mdyqp888`. If you use a different Privy app, set the same ID in both `VITE_PRIVY_APP_ID` (frontend build) and `PRIVY_APP_ID` (API). An optional verification key must belong to that app. The API uses `https://auth.privy.io/api/v1/apps/{PRIVY_APP_ID}/jwks.json` when the local key cannot verify a signature. It caches these keys and still requires ES256, issuer `privy.io`, the configured app audience, an unexpired token and a Privy user ID. Token-supplied key URLs are ignored. Both access and identity tokens use this verification; checkout still requires the exact embedded wallet to belong to the authenticated user. Only the public App ID uses a `VITE_` variable; signing keys and Redis credentials must stay server-side.

Create/connect a persistent **Upstash Redis** database through Vercel's Storage/Marketplace integration or the Upstash console. Use its HTTPS REST endpoint and read/write token, not a TCP `REDIS_URL` or read-only token. If the integration supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN`, the adapter also accepts those names. Choose a database without an expiry or an eviction policy that would remove account records; review the provider's plan before purchasing anything. The application does not provision a database automatically.

The public website, health route and market routes can run without Redis. Saved stocks, deposit history and rate-limited account operations return an explicit unavailable result until the account store is configured. They do not silently fall back to temporary server memory. Signing-key lookup failures reject authentication and produce a private `PRIVY_AUTH` log with a bounded error category, never the token or credentials.

`BINANCE_TEST_TOKEN` protects the separate diagnostic package only. The full app does not use it. The temporary `BINANCE_SUPPORT_CAPTURE_UNTIL` capture has been retired and is ignored.

## 3. Retain existing account history

If you have saved stocks or deposit sessions in the old Worker, set `LEGACY_ACCOUNTS_ORIGIN` to the exact old origin **before the first authenticated request creates the user's Redis record**. Retain the same Privy app and keep the original Worker and its account/authentication configuration available during migration.

On each user's first account operation, Vercel forwards that user's verified access token only to the fixed original Worker, reads `/api/me` and `/api/deposits`, validates the returned account ID and records, and commits the imported state to Redis. Later operations use Redis directly. Failed imports return an error; they do not replace history with an empty account. Already-created Redis accounts are not overwritten by this import.

Stop using the old site's account-writing actions during cutover. This is a one-time per-user import, not ongoing synchronization. Quote rate counters start fresh; saved stocks and deposit sessions are retained. Check that required users can see their original saved assets and deposit records before removing the legacy setting or retiring the Worker. Users who have not returned have not been imported. The importer does not delete Cloudflare records.

If there are no account records to preserve, omit `LEGACY_ACCOUNTS_ORIGIN` and initialize new Redis accounts. Hosting does not move the Privy wallet's keys or on-chain balances; signing in to the same Privy identity continues to use that wallet.

## 4. Allow the new app origin

Add your new Vercel deployment origin to the configured Privy app's allowed domains. Keep Google/email login enabled. For checkout and ownership checks, retain Privy's **Return user data in an identity token** setting and sign in again if you change it.

If using MoonPay sandbox, add the new origin to the integration's allowed domains and enable Ethereum for test delivery. Existing test checkout is **ETH on Ethereum Sepolia**, separately labelled from the BSC portfolio; it does not deliver real BSC USDT. Production card checkout still depends on MoonPay approval and live integration configuration. Trading remains a read-only route check; deploying to Vercel does not implement stock order execution.

## 5. Deploy and check the full app

Deploy the latest `main` commit with the root settings above. Use the new project URL for these checks:

1. `/api/health` should return `{"status":"ok"}`. This does not check provider or database connectivity.
2. `/api/market/NVDAon?frame=15m` should return `status: "ready"` and `source: "binance-web3"`. Check that `priceUsd` is a positive number, `asOf` is current and `candles` contains valid OHLC rows. A ready response may contain only price or only candles; verify both before claiming that the chart is working.
3. Open `/` and `/app/?tab=trade`. Confirm that styling loads and the Trade chart and price match the normalized API result. Test another timeframe and asset.
4. Sign in with the same Privy identity. Verify the wallet address, save a stock, reload, and confirm that the saved choice persists. If importing, compare saved stocks and deposit history with the old site.
5. If configured, run a clearly labelled MoonPay sandbox checkout and verify its returned session. Do not treat a mock test, test payment or accepted market request as a real stock purchase.

Record the new deployment URL, exact signed request times, provider codes, response validity, latency and account results in the [Developer Experience Report](developer-experience-report.md). Current code validation used mocked Binance/Redis requests and fixture JWTs; no new live full-app result is claimed.

## Failure recovery

| Result | Check |
| --- | --- |
| Diagnostic page still appears | Root Directory is still `server-test`, or an old deployment URL is open |
| App works but `/api/*` serves HTML | Deploy the root `vercel.json` and verify the API function was built |
| `account_not_configured` | Configure a valid Privy App ID matching the frontend and redeploy |
| HTTP 401 on `/api/deposits/config` | The sign-in token was rejected before MoonPay. Check private `PRIVY_AUTH` logs, matching frontend/server App IDs and session expiry. A missing or stale PEM can fall back to Privy's published keys; wallet ownership remains required for checkout. |
| `account_storage_not_configured` | Add the Redis REST URL/token pair and redeploy |
| `account_storage_unavailable` | Check database availability, limits and write-token permissions in the provider console |
| `account_import_unavailable` | Keep the exact original Worker reachable with its matching Privy configuration; do not disable import merely to create an empty account over existing history |
| HTTP 200 upstream with code `40304` | Binance still declined the operation; retain the provider's request correlation details and follow up with Binance support |

The original Cloudflare adapter and deployment command remain available. If you return to Cloudflare after users have written new Redis records, those newer records do not automatically synchronize back to Durable Objects.

## References

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Node.js runtime and Web Standard handlers](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel regions](https://vercel.com/docs/regions)
- [Vercel request headers](https://vercel.com/docs/headers/request-headers)
- [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi)
- [Binance Web3 API error codes](https://web3.binance.com/en/dev-docs/products/defi-api/error-codes)
