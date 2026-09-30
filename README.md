# FirstBell

FirstBell is a landing page and research app for exploring tokenized equities on BNB Smart Chain. It presents issuer, network, token symbol, contract address, and public source links for five Ondo Global Markets assets. Market data and indicative quotes are available when their providers respond; order execution is not available yet.

## Hackathon report and integration requirement

The [living Developer Experience field log](docs/developer-experience-report.md) records verified build evidence and outstanding tests. The hackathon weights its report at 25% and requires at least one Binance Web3 API module in the working project. FirstBell now has a signed Binance RWA Data integration, but its live call and deployment still need verification with developer credentials. Record its first successful call and failures in the log, and review the final report from firsthand experience before submitting.

## Run locally

```bash
npm install
npm run dev
```

Build with `npm run build`.

## Deploy to Cloudflare Workers

`wrangler.jsonc` serves the Vite output in `dist` as Workers static assets and routes `/api/*` to the Worker. Both `/` and `/app/` are built as HTML entry points. The Worker stores one account record per verified Privy user in a SQLite-backed Durable Object.

1. Sign in with `npx wrangler login` (or set a scoped `CLOUDFLARE_API_TOKEN` in your deployment environment).
2. FirstBell includes its public Privy App ID in `src/privy-config.ts`. For a different Privy app, set `VITE_PRIVY_APP_ID` in the environment that runs `npm run build`. Vite embeds this value in the browser bundle at build time; a Worker runtime variable set after the build cannot change the login app.
3. In the Privy dashboard, copy the app's **verification public key**. Add it to the Worker as the runtime secret `PRIVY_VERIFICATION_KEY` (PEM format). For a first CLI deployment, run `npx wrangler secret put PRIVY_VERIFICATION_KEY` after creating the Worker, then deploy again. In the Cloudflare dashboard use **Workers & Pages → firstbell → Settings → Variables and Secrets → Add**. Do not use your Privy App Secret here.
4. Run `npm run deploy:cloudflare`. Add the resulting `https://firstbell.<your-subdomain>.workers.dev` origin to your Privy app's allowed domains. A new deployment is required after changing build variables; runtime secrets are read by the Worker without rebuilding the frontend.
5. For Ondo primary-market candles and authenticated quote estimates, obtain an API key through [Ondo developer onboarding](https://docs.ondo.finance/ondo-global-markets/developer-resources/api-reference/overview) and add `ONDO_API_KEY` as a **Worker runtime secret**, using `npx wrangler secret put ONDO_API_KEY` or the Cloudflare dashboard. Never use `VITE_ONDO_API_KEY` or expose it in the browser. Without the key, charts use a public GeckoTerminal BSC pool only when it matches the exact Ondo token contract and meets the minimum liquidity check. Quote estimates remain unavailable.
6. For the Binance RWA Data integration, create a project in the [Binance Web3 Developer Portal](https://web3.binance.com/en/dev-portal). Put its API Key and Secret Key in the Worker as separate **runtime secrets**: `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY`. For CLI deployment use `npx wrangler secret put BINANCE_WEB3_API_KEY` and `npx wrangler secret put BINANCE_WEB3_SECRET_KEY` after creating the Worker. In the dashboard, add both under **Workers & Pages → firstbell → Settings → Variables and Secrets**. Do not add either to `VITE_` variables, client files, or Git. The public `/api/rwa/:symbol` route returns `not_configured` until both are present.

For Cloudflare Workers Builds connected to GitHub, use `npm run build` as the build command and `npx --yes wrangler@4.144.0 deploy` as the deploy command. Set `VITE_PRIVY_APP_ID` as a **build** variable only if deploying with a different Privy app. Configure `PRIVY_VERIFICATION_KEY` and the two Binance credentials on the Worker as **runtime** secrets. Keep all signing secrets out of the frontend and repository. The Vite build uses Tailwind's PostCSS plugin in `postcss.config.mjs`; check that `dist/assets/*.css` are nonempty after building.

## Login and wallets

FirstBell uses Privy for Google and email one-time-code sign-in. The Privy modal creates an embedded EVM wallet for a new account; a returning account loads its existing wallet. Portfolio reads the authenticated wallet's native BNB and five listed token balances from the BNB Smart Chain public RPC using viem. It displays quantities, not an invented USD valuation. On sign-in, `/api/me` verifies the Privy access token and creates or retrieves an account; saved assets sync through `/api/me/saved`. The browser retains local bookmarks when the API is unavailable. Deposit, Withdraw, and trade execution remain disabled.

1. In the [Privy Dashboard](https://dashboard.privy.io/) for the configured App ID, enable **Email** and **Google** login, and allow your deployment origin (and localhost for development).
2. The public App ID is in `src/privy-config.ts`; override it in a local `.env` as `VITE_PRIVY_APP_ID=...` to use another Privy app. Do not put a Privy App Secret in a Vite variable or in this repository.
3. Build and deploy. A static deployment cannot pick up runtime environment variables after the build.
4. Add the verification public key to the Cloudflare Worker as described above. Without it the account endpoints return HTTP 503; the login modal and public chain balance reads still use Privy directly.
5. Sign in, check the wallet address against BscScan, log out, then sign in again with the **same linked identity** to verify the address is unchanged. To use Google and email interchangeably for one wallet, link the other method from the authenticated Portfolio screen before logging out.

The Worker uses Privy's ES256 verification key, issuer and app audience to validate the access token before forwarding the user ID to that user's Durable Object. `GET /api/health` is public. `GET /api/me` returns `{ account: { id, createdAt, lastSeenAt, saved } }`; `PUT /api/me/saved` accepts `{ symbol, saved }` for an indexed token. Both account routes require `Authorization: Bearer <Privy access token>`. The account record holds a Privy ID and saved symbols; it does not store wallet keys, credentials, or a fabricated balance. The wallet and its balances come from Privy and BNB Smart Chain. Transfers, transaction history, and USD portfolio valuation remain separate integrations.

## Market and trade API

- `GET /api/rwa/:symbol` calls the signed Binance Web3 RWA Data price and underlying-market endpoints for the token's **exact Ondo BSC contract**. It returns the on-chain token price, per-share reference, price update time and underlying market session when verified. Each signature covers the ISO timestamp, uppercase method, exact `/build` path and raw query, with HMAC-SHA256 and Base64. The secret stays in the Worker. The public read route has a 30-second isolate cache. `not_configured`, `no_verified_asset` and `provider_error` are explicit unavailable states. The underlying-market status may be absent even when price is present.
- `GET /api/market/:symbol?frame=15m|1h|4h|1D` returns the token price, 24h change, source, timestamp, and normalized candles. The source is `ondo` for Ondo primary-market prices or `geckoterminal` for an exact-token BSC DEX pool. These are different markets and may have different prices. Missing feeds return HTTP 503 with `status: "unavailable"`; no placeholder price is generated. The short in-process cache is 30 seconds.
- `POST /api/trade/quote` accepts `{ "symbol": "TSLAon", "side": "buy", "quantity": "0.5" }` with a verified Privy Bearer token and a configured `ONDO_API_KEY`. It requests an Ondo **soft quote**, validates its chain, address, side and quantity, and returns `{ quote: { priceUsd, estimatedTotalUsd, executable: false, ... } }`. Requests are limited to six per user per minute in the account Durable Object. The estimate does not reserve a price or submit a transaction.
- On-chain buying or selling requires Ondo eligibility/onboarding, a signed binding attestation, current USDT allowance and a user-approved BNB Chain transaction through the relevant audited manager contract. None of those steps is implied by a soft quote. The UI provides no submit-order action until that path can be verified end to end. Do not describe the market display price as a trade fill price.

Run the provider parser and signing tests with `node --test tests/market.test.mjs tests/binance-rwa.test.mjs`. They use mocked responses and do not establish live provider availability. Run `npm run build` and `npx wrangler deploy --dry-run` before deployment. With real keys and a deployed Worker, request `/api/rwa/NVDAon` and verify `source: "binance-web3-rwa"`, the expected contract in the provider response, and a genuine `priceUpdatedAt` before claiming a live integration in the report.

## Interface

- The hero adapts the user-supplied floating-icons component in `components/ui/floating-icons-hero-section.tsx` and uses transparent company SVG marks listed in `brand-mark-sources.json`. The asset symbols and contract data are from the [Ondo token list](https://github.com/ondoprotocol/ondo-global-markets-token-list/blob/main/tokenlist.json).
- The [React Bits Logo Loop](https://reactbits.dev/animations/logo-loop) and [Scroll Float](https://reactbits.dev/text-animations/scroll-float) adaptations live in `components/ui/`. Scroll Float uses GSAP ScrollTrigger for the section headings and footer statement, and shows plain text when reduced motion is requested. Their license notice is in `third_party/REACT_BITS_LICENSE.md`.
- `src/demo.tsx` contains the landing. `/app/` is a separate route with Home, Trade, Agent, and Portfolio in `src/app.tsx`.
- Home has a searchable catalog and source-linked asset files. Bookmarks sync to the account after sign-in when the Worker is configured. Trade provides an asset selector, the [Spectrum UI Market Chart](https://ui.spectrumhq.in/blocks/charts#market) with real provider OHLC when available, a separate Binance Web3 RWA readout, contract details, and a Buy/Sell estimate sheet. The quote is not executable. Agent uses an adapted [Spectrum UI AI Chat Card](https://ui.spectrumhq.in/docs/ai-chat-card) and answers fixed issuer, contract, and network questions from the token list when a company or token symbol is mentioned. Portfolio reads BNB and listed token quantities on chain. Deposit and Withdraw are disabled.
- Spectrum chart source is in `components/spectrumui/charts/` and the adapted chat card and typewriter are in `components/spectrumui/`; their Apache 2.0 license is in `third_party/SPECTRUM_UI_LICENSE.txt`. The chart's demo-generated prices are never shown as token prices. The Agent is a deterministic source guide, not a live AI model.
- `src/styles.css` defines a sharp monochrome system. Light mode uses white surfaces. Inter and IBM Plex Mono are self-hosted through Fontsource packages.
- `AGENTS.md` contains the project design workflow and `UI.md` records the FirstBell-specific visual contract.

The `App` navigation item opens `/app/`. The company marks are visual navigation cues, while issuer and contract details are derived from `asset-sources.json`; the external contract links open BscScan. No price, entitlement, or availability is inferred from the ticker alone.
