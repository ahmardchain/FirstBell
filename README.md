# FirstBell

FirstBell is a landing page and research app for exploring tokenized equities on BNB Smart Chain. It presents issuer, network, token symbol, contract address, and public source links for five example Ondo Global Markets assets. Live trading is not available yet.

## Run locally

```bash
npm install
npm run dev
```

Build with `npm run build`.

## Deploy to Cloudflare Workers

`wrangler.jsonc` serves the Vite output in `dist` as Workers static assets and routes `/api/*` to the account Worker. Both `/` and `/app/` are built as HTML entry points. The Worker stores one account record per verified Privy user in a SQLite-backed Durable Object.

1. Sign in with `npx wrangler login` (or set a scoped `CLOUDFLARE_API_TOKEN` in your deployment environment).
2. FirstBell includes its public Privy App ID in `src/privy-config.ts`. For a different Privy app, set `VITE_PRIVY_APP_ID` in the environment that runs `npm run build`. Vite embeds this value in the browser bundle at build time; a Worker runtime variable set after the build cannot change the login app.
3. In the Privy dashboard, copy the app's **verification public key**. Add it to the Worker as the runtime secret `PRIVY_VERIFICATION_KEY` (PEM format). For a first CLI deployment, run `npx wrangler secret put PRIVY_VERIFICATION_KEY` after creating the Worker, then deploy again. In the Cloudflare dashboard use **Workers & Pages → firstbell → Settings → Variables and Secrets → Add**. Do not use your Privy App Secret here.
4. Run `npm run deploy:cloudflare`. Add the resulting `https://firstbell.<your-subdomain>.workers.dev` origin to your Privy app's allowed domains. A new deployment is required after changing build variables; runtime secrets are read by the Worker without rebuilding the frontend.

For Cloudflare Workers Builds connected to GitHub, use `npm run build` as the build command and `npx --yes wrangler@4.144.0 deploy` as the deploy command. Set `VITE_PRIVY_APP_ID` as a **build** variable only if deploying with a different Privy app. Configure `PRIVY_VERIFICATION_KEY` on the Worker as a **runtime** secret. Keep the Privy App Secret out of the frontend and repository. The Vite build uses Tailwind's PostCSS plugin in `postcss.config.mjs`; check that `dist/assets/*.css` are nonempty after building.

## Login and wallets

FirstBell uses Privy for Google and email one-time-code sign-in. The Privy modal creates an embedded EVM wallet for a new account; a returning account loads its existing wallet. Portfolio reads the authenticated wallet's native BNB and five listed token balances from the BNB Smart Chain public RPC using viem. It displays quantities, not an invented USD valuation. On sign-in, `/api/me` verifies the Privy access token and creates or retrieves an account; saved assets sync through `/api/me/saved`. The browser retains local bookmarks when the API is unavailable. Deposit, Withdraw, and trade execution remain disabled.

1. In the [Privy Dashboard](https://dashboard.privy.io/) for the configured App ID, enable **Email** and **Google** login, and allow your deployment origin (and localhost for development).
2. The public App ID is in `src/privy-config.ts`; override it in a local `.env` as `VITE_PRIVY_APP_ID=...` to use another Privy app. Do not put a Privy App Secret in a Vite variable or in this repository.
3. Build and deploy. A static deployment cannot pick up runtime environment variables after the build.
4. Add the verification public key to the Cloudflare Worker as described above. Without it the account endpoints return HTTP 503; the login modal and public chain balance reads still use Privy directly.
5. Sign in, check the wallet address against BscScan, log out, then sign in again with the **same linked identity** to verify the address is unchanged. To use Google and email interchangeably for one wallet, link the other method from the authenticated Portfolio screen before logging out.

The Worker uses Privy's ES256 verification key, issuer and app audience to validate the access token before forwarding the user ID to that user's Durable Object. `GET /api/health` is public. `GET /api/me` returns `{ account: { id, createdAt, lastSeenAt, saved } }`; `PUT /api/me/saved` accepts `{ symbol, saved }` for an indexed token. Both account routes require `Authorization: Bearer <Privy access token>`. The account record holds a Privy ID and saved symbols; it does not store wallet keys, credentials, or a fabricated balance. The wallet and its balances come from Privy and BNB Smart Chain. Transfers, transaction history, market prices, and USD valuation are separate integrations.

## Interface

- The hero adapts the user-supplied floating-icons component in `components/ui/floating-icons-hero-section.tsx` and uses transparent company SVG marks listed in `brand-mark-sources.json`. The asset symbols and contract data are from the [Ondo token list](https://github.com/ondoprotocol/ondo-global-markets-token-list/blob/main/tokenlist.json).
- The [React Bits Logo Loop](https://reactbits.dev/animations/logo-loop) and [Scroll Float](https://reactbits.dev/text-animations/scroll-float) adaptations live in `components/ui/`. Scroll Float uses GSAP ScrollTrigger for the section headings and footer statement, and shows plain text when reduced motion is requested. Their license notice is in `third_party/REACT_BITS_LICENSE.md`.
- `src/demo.tsx` contains the landing. `/app/` is a separate route with Home, Trade, Agent, and Portfolio in `src/app.tsx`.
- Home has a searchable catalog and source-linked asset files. Bookmarks sync to the account after sign-in when the Worker is configured. Trade provides an asset selector, the [Spectrum UI Market Chart](https://ui.spectrumhq.in/blocks/charts#market) in its no-data state, contract details, and an interactive Buy/Sell sheet. Live token price candles, quotes, and execution require integrations and are not represented as available. Agent uses an adapted [Spectrum UI AI Chat Card](https://ui.spectrumhq.in/docs/ai-chat-card) and answers fixed issuer, contract, and network questions from the token list when a company or token symbol is mentioned. Portfolio reads BNB and listed token quantities on chain. Deposit and Withdraw are disabled.
- Spectrum chart source is in `components/spectrumui/charts/` and the adapted chat card and typewriter are in `components/spectrumui/`; their Apache 2.0 license is in `third_party/SPECTRUM_UI_LICENSE.txt`. The app supplies an empty dataset until a verified token-specific OHLC feed is connected. The chart's demo-generated prices are never shown as token prices. The Agent is a deterministic source guide, not a live AI model.
- `src/styles.css` defines a sharp monochrome system. Light mode uses white surfaces. Inter and IBM Plex Mono are self-hosted through Fontsource packages.
- `AGENTS.md` contains the project design workflow and `UI.md` records the FirstBell-specific visual contract.

The `App` navigation item opens `/app/`. The company marks are visual navigation cues, while issuer and contract details are derived from `asset-sources.json`; the external contract links open BscScan. No price, entitlement, or availability is inferred from the ticker alone.
