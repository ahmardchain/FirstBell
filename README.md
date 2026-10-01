# FirstBell

FirstBell is a landing page and research app for exploring tokenized equities on BNB Smart Chain. It presents issuer, network, token symbol, contract address, and public source links for five Ondo Global Markets assets. Market data and indicative quotes are available when their providers respond; order execution is not available yet.

## Hackathon report and integration requirement

The [living Developer Experience field log](docs/developer-experience-report.md) records verified build evidence and outstanding tests. The hackathon weights its report at 25% and requires at least one Binance Web3 API module in the working project. FirstBell now has a signed Binance RWA Data integration, but its live call and deployment still need verification with developer credentials. Record its first successful call and failures in the log, and review the final report from firsthand experience before submitting.

## Run locally

```bash
npm install
npm run dev
```

Build with `npm run build`. Run the backend regression suite with `npm test` (Node 24 or later).

### Test Binance directly from your computer

To investigate the deployed `40304` response without changing hosting, use Node 24 or later and run:

```bash
node scripts/check-binance-market.mjs
```

No `npm install`, frontend build, Privy login or Cloudflare deployment is needed for this standalone test. Paste your **Binance Web3 Developer Portal** API Key and matching Secret Key at the two hidden terminal prompts, pressing Enter after each. It holds them in memory for this run and does not write a credentials file. Existing `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY` environment variables can also supply the credentials; do not put their values in shell commands or Git.

The script makes exactly two read-only requests from your computer to Binance: NVDAon BSC 56 candles (`15m`, limit 100), then token trading info (`POST /price-info`). It matches the Worker's paths, parameters, raw POST body and HMAC signing. Runtime/network defaults such as the automatically supplied User-Agent may differ. It prints each request's ISO timestamp, endpoint, first eight API-key characters, HTTP status, business code, bounded redacted provider message, data item count and elapsed milliseconds. Raw data, full credentials, signatures and non-JSON bodies are omitted. Exit code 0 means both requests were accepted; exit code 1 means a request failed or setup was incomplete; Ctrl+C at a key prompt cancels with exit code 130. Acceptance, especially with zero data items, does not verify current prices or usable candles.

Compare the output with the deployed `/api/market/NVDAon?frame=15m` response using the same credentials around the same time. Local acceptance with Worker rejection narrows investigation to hosting or request-path differences; it does not identify a particular IP rule or prove a VPS will solve it. The same compliance error locally shows the failure also occurs outside the Worker. On 2026-10-01 the builder reported accepted local calls with 100 candle entries and one trading-info entry, followed by another deployed `40304` response. Raw data validity and the saved Worker credential pair remain unverified. Save the sanitized reports for Binance Web3 API technical support; the [field log](docs/developer-experience-report.md) retains the results and their limits.

### Run the app and Worker together locally

`npm run dev` runs the Vite frontend alone; this repository does not configure a Vite proxy for `/api/*`. To test the actual Worker market parser and chart from your computer, follow the [Cloudflare local development](https://developers.cloudflare.com/workers/local-development/) and [local secrets](https://developers.cloudflare.com/workers/local-development/environment-variables/) workflow:

1. In the project root, create `.dev.vars` beside `wrangler.jsonc`. Use the credential pair that succeeded in the direct diagnostic:

   ```dotenv
   BINANCE_WEB3_API_KEY="your-web3-api-key"
   BINANCE_WEB3_SECRET_KEY="your-matching-secret-key"
   ```

   This setup saves the keys on your computer, unlike the standalone diagnostic. `.dev.vars*` is already ignored by Git. Keep the file private and delete it after testing if you do not want to retain the keys.

2. In the VS Code terminal, run these commands in order:

   ```bash
   npm install
   npm run build
   npx --yes wrangler@4.144.0 dev --local --port 8787
   ```

3. Leave the terminal running. Open `http://localhost:8787/api/market/NVDAon?frame=15m` first, then `http://localhost:8787/app/` and choose Trade. A useful result should name `source: "binance-web3"`, contain valid candles and provide a positive `priceUsd` for the current price. An accepted direct diagnostic alone does not prove those checks pass.

This runs the Worker and its bindings locally while making real read-only Binance market requests from your computer. Public market reads do not require Privy login. For login or authenticated wallet features, allow `http://localhost:8787` in the Privy app and configure the relevant local authentication secrets separately. Local setup does not resolve the deployed compliance error or verify an executable stock trade. Build again and restart Wrangler after changing the frontend.

### Capture private Binance failure diagnostics

Deploy the latest source first. Failed signed Binance requests now emit a `BINANCE_DIAG` marker and structured object in Worker logs. No new secrets are required. Each entry records the method, `/build` endpoint path without query parameters, exact signed `requestTimestamp`, upstream `httpStatus`, numeric `providerCode`, fixed failure reason and a provider `msg` capped at 200 characters. Actual credentials, signature, nonce and request values are redacted from message echoes, including common encoded forms, before truncation. Raw request/response bodies, headers, HTML and exception messages are not logged; the public API still omits provider messages.

1. Open **Workers & Pages → firstbell → Logs → Live**, following Cloudflare's [real-time logs guide](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/), and start the live session.
2. In another tab, open [the NVDAon market endpoint](https://firstbell.ahmardchain.workers.dev/api/market/NVDAon?frame=15m).
3. Copy only the `BINANCE_DIAG` entries for `GET /build/api/v1/dex/market/candles` and `POST /build/api/v1/dex/market/price-info`. Do not share the entire invocation trace, which can contain request headers. Successful requests emit no diagnostic, so only failed endpoints appear.

Alternatively, start the CLI tail from the project root before opening the market endpoint:

```bash
npx --yes wrangler@4.144.0 tail firstbell --format json
```

The timestamp matches the `X-OC-TIMESTAMP` used for that request. A generic message, missing message or `40304` alone does not establish an IP allowlist or specific compliance rule. No real provider message from these new logs has been captured yet; compare the entries with the accepted local diagnostic for Binance Web3 technical support.

## Deploy to Cloudflare Workers

`wrangler.jsonc` serves the Vite output in `dist` as Workers static assets and routes `/api/*` to the Worker. Both `/` and `/app/` are built as HTML entry points. The Worker stores one account record per verified Privy user in a SQLite-backed Durable Object.

1. Sign in with `npx wrangler login` (or set a scoped `CLOUDFLARE_API_TOKEN` in your deployment environment).
2. FirstBell includes its public Privy App ID in `src/privy-config.ts`. For a different Privy app, set `VITE_PRIVY_APP_ID` in the environment that runs `npm run build`. Vite embeds this value in the browser bundle at build time; a Worker runtime variable set after the build cannot change the login app.
3. In the Privy dashboard, copy the app's **verification public key**. Add it to the Worker as the runtime secret `PRIVY_VERIFICATION_KEY` (PEM format). For a first CLI deployment, run `npx wrangler secret put PRIVY_VERIFICATION_KEY` after creating the Worker, then deploy again. In the Cloudflare dashboard use **Workers & Pages → firstbell → Settings → Variables and Secrets → Add**. Do not use your Privy App Secret here.
4. Run `npm run deploy:cloudflare`. Add the resulting `https://firstbell.<your-subdomain>.workers.dev` origin to your Privy app's allowed domains. A new deployment is required after changing build variables; runtime secrets are read by the Worker without rebuilding the frontend.
5. `ONDO_API_KEY` is optional for Binance charts and route checks. For the Ondo primary-market fallback and the legacy indicative quote endpoint, obtain an API key through [Ondo developer onboarding](https://docs.ondo.finance/ondo-global-markets/developer-resources/api-reference/overview) and add it as a **Worker runtime secret**, using `npx wrangler secret put ONDO_API_KEY` or the Cloudflare dashboard. Never use `VITE_ONDO_API_KEY` or expose it in the browser. With the Binance credentials below, charts request the Binance Web3 candle and trading-info feeds for the exact BSC token. Without a verified Binance feed, they try Ondo when configured and then a public GeckoTerminal BSC pool that matches the exact token and meets the minimum liquidity check.
6. For Binance RWA Data and trading-route checks, create a project in the [Binance Web3 Developer Portal](https://web3.binance.com/en/dev-portal). Put its API Key and Secret Key in the Worker as separate **runtime secrets**: `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY`. For CLI deployment use `npx wrangler secret put BINANCE_WEB3_API_KEY` and `npx wrangler secret put BINANCE_WEB3_SECRET_KEY` after creating the Worker. In the dashboard, add both under **Workers & Pages → firstbell → Settings → Variables and Secrets**. Do not add either to `VITE_` variables, client files, or Git. The public `/api/rwa/:symbol` route returns `not_configured` until both are present. The Trade screen's Binance route check uses these keys and does not require `ONDO_API_KEY`.

For Cloudflare Workers Builds connected to GitHub, use `npm run build` as the build command and `npx --yes wrangler@4.144.0 deploy` as the deploy command. Set `VITE_PRIVY_APP_ID` as a **build** variable only if deploying with a different Privy app. Configure `PRIVY_VERIFICATION_KEY` and the two Binance credentials on the Worker as **runtime** secrets. Keep all signing secrets out of the frontend and repository. The Vite build uses Tailwind's PostCSS plugin in `postcss.config.mjs`; check that `dist/assets/*.css` are nonempty after building.

## Login and wallets

FirstBell uses Privy for Google and email one-time-code sign-in. The Privy modal creates an embedded EVM wallet for a new account; a returning account loads its existing wallet. Portfolio reads USDT, native BNB and five listed token balances from the BNB Smart Chain public RPC using viem. It displays quantities, not an invented USD valuation. On sign-in, `/api/me` verifies the Privy access token and creates or retrieves an account; saved assets sync through `/api/me/saved`. The browser retains local bookmarks when the API is unavailable. Card deposit checkout is implemented and requires the configuration below. Withdrawals and stock trade execution remain disabled.

1. In the [Privy Dashboard](https://dashboard.privy.io/) for the configured App ID, enable **Email** and **Google** login, and allow your deployment origin (and localhost for development).
2. The public App ID is in `src/privy-config.ts`; override it in a local `.env` as `VITE_PRIVY_APP_ID=...` to use another Privy app. Do not put a Privy App Secret in a Vite variable or in this repository.
3. Build and deploy. A static deployment cannot pick up runtime environment variables after the build.
4. Add the verification public key to the Cloudflare Worker as described above. Without it the account endpoints return HTTP 503; the login modal and public chain balance reads still use Privy directly.
5. Sign in, check the wallet address against BscScan, log out, then sign in again with the **same linked identity** to verify the address is unchanged. To use Google and email interchangeably for one wallet, link the other method from the authenticated Portfolio screen before logging out.

The Worker uses Privy's ES256 verification key, issuer and app audience to validate the access token before forwarding the user ID to that user's Durable Object. `GET /api/health` is public. `GET /api/me` returns `{ account: { id, createdAt, lastSeenAt, saved } }`; `PUT /api/me/saved` accepts `{ symbol, saved }` for an indexed token. Both account routes require `Authorization: Bearer <Privy access token>`. The account record holds a Privy ID and saved symbols; it does not store wallet keys, credentials, or a fabricated balance. Card deposit records are stored separately in the same per-user Durable Object. The wallet and its balances come from Privy and BNB Smart Chain. General transaction history and USD portfolio valuation remain separate integrations.

## Check an Ondo trading route without an Ondo API key

The existing five Ondo tokens remain the asset catalog. Trade's Buy/Sell sheet now checks the [Binance Web3 Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), rather than requiring an Ondo primary-market soft quote. This is a read-only route check, not a purchase or sale.

1. Configure the two Binance runtime secrets above, retain `PRIVY_VERIFICATION_KEY`, and enable Privy's identity-token setting described below. Deploy this source update to the Worker.
2. Sign in to FirstBell and open **Trade → Buy**. Enter the amount of **BSC USDT to spend** and select **Check trading route**. For Sell, enter the selected stock token's quantity instead. Opening or switching sides keeps the units separate.
3. The Worker verifies the embedded wallet's ownership, calls the supported-chain endpoint, verifies BSC via RPC, reads the stock token's on-chain decimals, and requests a quote with `userWalletAddress`. Returned chain, contracts, input amount, decimals and `executionMode: RFQ` must match. Only then does the sheet show an estimated receiving amount and route vendor. The display becomes stale after its refresh deadline; recheck before relying on it.
4. A missing route is an explicit unavailable result. Availability depends on the wallet, provider access, amount, current liquidity and market conditions. No valid live route has been recorded here yet. Do not treat a code path or fixture as proof that a particular wallet can trade.

`POST /api/trade/route` accepts `{ symbol, side, amount, walletAddress }`, an access token and a separate `privy-id-token`. It shares the six-checks-per-minute account limit with the older indicative quote endpoint. It returns a sanitized `route` with `executable: false` and no approval calldata, signing payload or quote ID. Only read-only Binance GET requests are made; nothing is signed by the wallet, approved, submitted or broadcast. No `ONDO_API_KEY` or separate xStocks key is needed for this check.

**Execution remains unfinished.** Binance documents equities as RFQ orders: quote → build order → vendor-specific approval where needed → user-reviewed EIP-712 signature → order submission → settlement verification. That remaining flow must be implemented, simulated where applicable and verified with small BSC mainnet amounts before recording a real purchase. Keeping Ondo tokens while using Binance routing is a candidate path; no successful live quote, issuer-eligibility decision or stock trade is claimed.

## Card checkout: MoonPay → Privy wallet

Portfolio opens an amount dialog in the existing light/dark design. The Worker verifies that the receiving address is the signed-in user's Privy embedded EVM wallet, checks MoonPay's enabled currency catalog, and generates a server-signed, IP-bound checkout URL. The wallet, mode-specific asset and requested fiat amount are prefilled and locked. FirstBell never receives real card details.

| Mode | Portfolio action | MoonPay currency | Delivery network | Mainnet balance |
| --- | --- | --- | --- | --- |
| `sandbox` | Test card checkout | Native ETH (`eth`) | Ethereum Sepolia (11155111) | No BSC funds credited |
| `live` | Deposit from card | USDT (`usdt_bsc`) | BNB Smart Chain (56) | Actual BSC balance read after receipt verification |

### Activate sandbox checkout for the demo

1. In [MoonPay Developers → API Keys](https://dashboard.moonpay.com/), use the test keys available before production approval. Enable **Ethereum** in the integration's On-ramp asset settings. Add your FirstBell deployment domain to the allowed domains.
2. In **Cloudflare → Workers & Pages → firstbell → Settings → Variables and Secrets**, configure:

   | Runtime setting | Value |
   | --- | --- |
   | `MOONPAY_PUBLISHABLE_KEY` | Your `pk_test_…` key |
   | `MOONPAY_SECRET_KEY` | Its matching `sk_test_…` key |
   | `MOONPAY_ENVIRONMENT` | `sandbox` |

3. Keep `PRIVY_VERIFICATION_KEY` configured and enable **Return user data in an identity token** in Privy's authentication settings, as described below. Sign in again after enabling it.
4. In Portfolio choose **Test card checkout**. Verify that the dialog identifies **ETH / Ethereum Sepolia** and your embedded wallet address. Test checkout offers the provider's enabled USD/GBP payment currencies and their actual amount limits.
5. Follow [MoonPay's sandbox guide](https://dev.moonpay.com/widget/sandbox-testing). The dialog shows its UK frictionless Visa test card: `4485 0403 7153 6584`, expiry `12/2030`, CVC `123`. Use a UK test billing address only inside sandbox and an email you can access for the login OTP. KYC is simulated and document submission can be skipped. Never enter a real card into sandbox.
6. Return to FirstBell. A verified provider completion is labelled **Test completed**, with **no mainnet USDT credited**. The session records `currencyCode: eth`, and its transaction link uses Sepolia Etherscan. MoonPay documents testnet delivery as **1/100 of the quoted ETH amount**; FirstBell does not display the quote as a received balance.

The BSC mainnet portfolio remains independent: pre-fund the same embedded wallet address with real USDT on BSC and BNB for gas. This does not convert a test card payment into real money. The [hackathon](https://www.bnbchain.org/en/hackathons/tokenized-stocks) requires mainnet proof; an eventual recording must label sandbox checkout and any separately funded real stock purchase as separate parts. **Stock execution remains unfinished in the current app; pre-funding alone does not enable a buy.** See [the demo preparation guide](docs/demo-guide.md) for the remaining checks.

### Activate live checkout

1. Create/approve a [MoonPay business integration](https://dashboard.moonpay.com/), complete its production onboarding, and enable **USDT on BNB Smart Chain** in the partner asset settings. Confirm that IP enforcement is active with MoonPay as required by its [IP matching documentation](https://dev.moonpay.com/widget/on-ramp/customization/ip-matching). Country, bank, card and identity eligibility are determined by the provider; the general asset listing does not prove a specific card will be accepted.
2. In **Cloudflare → Workers & Pages → firstbell → Settings → Variables and Secrets**, add these three **runtime secrets** (not build variables):

   | Name | Value |
   | --- | --- |
   | `MOONPAY_PUBLISHABLE_KEY` | The integration's `pk_live_…` key |
   | `MOONPAY_SECRET_KEY` | Its matching `sk_live_…` signing key |
   | `MOONPAY_ENVIRONMENT` | `live` |

   Using runtime secrets also keeps dashboard configuration across Git-triggered Wrangler deployments. CLI equivalents are `npx wrangler secret put MOONPAY_PUBLISHABLE_KEY`, `npx wrangler secret put MOONPAY_SECRET_KEY` and `npx wrangler secret put MOONPAY_ENVIRONMENT`. Paste only into the dashboard or interactive CLI prompts. Never commit keys or prefix them with `VITE_`. The publishable key appears in the provider checkout URL as intended; the secret key stays in the Worker.
3. Keep the existing `PRIVY_VERIFICATION_KEY` runtime secret configured. In **Privy → User management → Authentication → Advanced**, enable **Return user data in an identity token**, following [Privy's identity token documentation](https://docs.privy.io/user-management/users/identity-tokens). Sign in again so checkout has an identity token containing the newly created embedded wallet. No Privy App Secret is needed for this integration.
4. Open Portfolio, choose **Deposit from card**, and review the correct wallet, USDT and BNB Smart Chain before entering MoonPay. Runtime secret changes do not require a frontend rebuild. FirstBell returns an explicit setup/unavailable state until the keys, mode and enabled asset are valid.
5. Complete one small live deposit through MoonPay yourself. Return to FirstBell and compare its confirmed transfer and wallet balance with BscScan. Record this real payment and its latency in the developer experience report before claiming the complete card flow works.

**Catalog observation, 2026-09-30:** MoonPay's public `/v3/currencies?show=all` lists `usdt_bsc`, chain `56`, contract `0x55d398326f99059ff775485246999027b3197955`, **18 decimals**, `supportsLiveMode: true` and **`supportsTestMode: false`**. Native `eth` supports test mode; its catalog metadata identifies Ethereum mainnet, while the sandbox guide explicitly says delivery is on Sepolia. FirstBell uses these two distinct routes and never counts test checkout as mainnet funds.

### Status and confirmation

- `GET /api/deposits/config` returns availability, mode, a reason when unavailable, and provider-derived fiat amount limits.
- `POST /api/deposits/checkout` accepts `{ walletAddress, amount, fiatCurrency, theme, sessionId? }`. It requires the usual Privy access token, an independently verified `privy-id-token`, and a same-origin `Origin` header. New sessions use a server-generated UUID; resuming a session preserves its amount, address and ID. Checkout is limited to three requests per account per minute.
- `GET /api/deposits` returns this account's persisted deposit history. `GET /api/deposits/:id` checks MoonPay's external-transaction lookup, with a 15-second cache and an account rate limit. The browser checks the selected pending deposit, or the most recent pending deposit, every 15 seconds while visible and refreshes on return to the app. Older deposits can be checked from Activity. Unused checkouts are labeled expired after 24 hours without a detected payment; this local timeout does not cancel MoonPay checkout. Expired records remain retained and checkable so a late payment can still be confirmed.
- Provider status is validated against the session's customer ID, recipient, recorded asset, fiat currency and requested amount. A redirect's `transactionStatus` is never treated as proof. A live deposit becomes **completed** only after a successful BSC receipt contains the expected USDT transfer to this wallet and has three block confirmations. Failed or missing RPC receipts stay unconfirmed. Sandbox sessions only become **test_completed**, retain `receivedAmount: null`, and never enter the BSC receipt-confirmation path. Balance refresh reads the actual chain; it never credits a local mock balance.
- Old BSC deposit records remain labelled as BSC USDT after switching mode. A pending record cannot be resumed or polled as a different asset/environment; automatic polling selects pending records matching the current configuration.
- Sessions survive reload and closing the dialog. Activity contains card deposits only. All pending and expired records, plus the 20 most recent finalized payment records, are retained. Card details, identity documents, signing secrets and full checkout URLs are not stored in deposit history.
- Signed URLs bind to the current Cloudflare-observed IP (with canonical IPv6 and Pseudo IPv4 handling). Do not change Wi-Fi, cellular or VPN between generating and opening checkout. Private Relay and split-network cases need an additional tested detection flow; this integration does not bypass IP matching.

Receiving USDT does not fund outgoing transaction gas automatically. Portfolio shows the separate **BNB for network fees** balance. Gas sponsorship, executable stock buys/sells and withdrawal are still separate work. Card funding speed depends on MoonPay and verification; the "under a minute" idea is a target that has not been demonstrated with a real payment.

## Market and trade API

- `GET /api/rwa/:symbol` calls the signed Binance Web3 RWA Data price and underlying-market endpoints for the token's **exact Ondo BSC contract**. It returns the on-chain token price, per-share reference, price update time and underlying market session when verified. Each signature covers the ISO timestamp, uppercase method, exact `/build` path and raw query, with HMAC-SHA256 and Base64. The secret stays in the Worker. The public read route has a 30-second isolate cache. `not_configured`, `no_verified_asset` and `provider_error` are explicit unavailable states. The underlying-market status may be absent even when price is present.
- `GET /api/market/:symbol?frame=15m|1h|4h|1D` uses the runtime Binance credentials for signed `GET /api/v1/dex/market/candles` and `POST /api/v1/dex/market/price-info` requests. The source is `binance-web3`, `ondo` for the configured primary-market fallback, or `geckoterminal` for an exact-token BSC DEX pool. The Binance tuple is `[open, high, low, close, volume, timestamp_ms, tradeCount]`; only valid, sorted, unique bars are rendered. The daily UI frame maps to `bar=1d`. Current price and 24h change require the exact BSC contract and its observation timestamp. A valid price can be returned with empty candles and `historyError`; a chart alone does not invent a current price. The Trade header can separately display a verified Binance RWA token price, with its own label, when chart-market price is missing. No traditional exchange or placeholder prices are substituted.
- Missing feeds return HTTP 503 with `status: "unavailable"`. Binance access rejection, rate limiting and provider failure have distinct `reason` values; only numeric `httpStatus` and `providerCode` are exposed for diagnosis. Provider message text and secrets are never returned. A nonzero business code is checked even when Binance returns HTTP 200. Valid responses use a 30-second isolate cache; failures and partial history errors are not cached.
- `POST /api/trade/quote` accepts `{ "symbol": "TSLAon", "side": "buy", "quantity": "0.5" }` with a verified Privy Bearer token and a configured `ONDO_API_KEY`. It requests an Ondo **soft quote**, validates its chain, address, side and quantity, and returns `{ quote: { priceUsd, estimatedTotalUsd, executable: false, ... } }`. Requests are limited to six per user per minute in the account Durable Object. The estimate does not reserve a price or submit a transaction.
- On-chain buying or selling requires Ondo eligibility/onboarding, a signed binding attestation, current USDT allowance and a user-approved BNB Chain transaction through the relevant audited manager contract. None of those steps is implied by a soft quote. The UI provides no submit-order action until that path can be verified end to end. Do not describe the market display price as a trade fill price.

Run `npm test` for provider parsers, signing, error handling and wallet guards. These checks use mocked responses and do not establish live provider availability. Run `npm run build` and `npx wrangler deploy --dry-run` before deployment. With the stored keys and the latest source deployed, request `/api/market/NVDAon?frame=15m` and `/api/rwa/NVDAon`. Verify the actual provider/source, observation timestamps and genuine candles, or record the sanitized failure codes before claiming a live integration in the report. Stored secrets alone do not deploy new source code.

## Interface

- The hero adapts the user-supplied floating-icons component in `components/ui/floating-icons-hero-section.tsx` and uses transparent company SVG marks listed in `brand-mark-sources.json`. The asset symbols and contract data are from the [Ondo token list](https://github.com/ondoprotocol/ondo-global-markets-token-list/blob/main/tokenlist.json).
- The [React Bits Logo Loop](https://reactbits.dev/animations/logo-loop) and [Scroll Float](https://reactbits.dev/text-animations/scroll-float) adaptations live in `components/ui/`. Scroll Float uses GSAP ScrollTrigger for the section headings and footer statement, and shows plain text when reduced motion is requested. Their license notice is in `third_party/REACT_BITS_LICENSE.md`.
- `src/demo.tsx` contains the landing. `/app/` is a separate route with Home, Trade, Agent, and Portfolio in `src/app.tsx`.
- Home has a searchable catalog and source-linked asset files. Bookmarks sync to the account after sign-in when the Worker is configured. Trade provides an asset selector, the [Spectrum UI Market Chart](https://ui.spectrumhq.in/blocks/charts#market) with real provider OHLC when available, a separate Binance Web3 RWA readout, contract details, and a Buy/Sell estimate sheet. The quote is not executable. Agent uses an adapted [Spectrum UI AI Chat Card](https://ui.spectrumhq.in/docs/ai-chat-card) and answers fixed issuer, contract, and network questions from the token list when a company or token symbol is mentioned. Portfolio reads BNB and listed token quantities on chain. MoonPay checkout is available with matching provider keys and Privy wallet verification; sandbox and live modes have distinct asset/network labels. Withdraw remains disabled.
- Spectrum chart source is in `components/spectrumui/charts/` and the adapted chat card and typewriter are in `components/spectrumui/`; their Apache 2.0 license is in `third_party/SPECTRUM_UI_LICENSE.txt`. The chart's demo-generated prices are never shown as token prices. The Agent is a deterministic source guide, not a live AI model.
- `src/styles.css` defines a sharp monochrome system. Light mode uses white surfaces. Inter and IBM Plex Mono are self-hosted through Fontsource packages.
- `AGENTS.md` contains the project design workflow and `UI.md` records the FirstBell-specific visual contract.

The `App` navigation item opens `/app/`. The company marks are visual navigation cues, while issuer and contract details are derived from `asset-sources.json`; the external contract links open BscScan. No price, entitlement, or availability is inferred from the ticker alone.
