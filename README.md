# FirstBell

**Buy your first stock on-chain.** FirstBell helps people new to crypto reach tokenized equities through Google/email login, local-currency card or bank funding into USDT, reviewed trades and clear portfolio tracking on BNB Smart Chain.

[Live website](https://firstbell-server-test.vercel.app/) · [Open the app](https://firstbell-server-test.vercel.app/app/) · [Submission checklist](docs/submission-checklist.md) · [Demo recording guide](docs/demo-guide.md) · [Developer Experience field log](docs/developer-experience-report.md)

Built for [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks?tab=tracks). Ondo tokenized assets on **BSC mainnet, chain 56**, are central to the product. Trades are spot only. The one-minute journey is a design goal; a measured one-minute card-to-stock purchase has not been established.

## The user journey

1. **Sign in:** Google or email creates or restores a Privy embedded EVM wallet without asking the user to manage a seed phrase.
2. **Fund:** Onramper collects the amount, local currency and available card/bank method. The normal funding route fixes the receiving wallet and BSC USDT. Country, provider and account eligibility determine coverage; sandbox payments never credit mainnet balances.
3. **Buy:** choose a token, inspect its issuer/network/contract and review the USDT spend, token receive estimate, minimum, fee and expiry before wallet confirmation.
4. **Track and withdraw:** positions show current value and purchase-based gains/losses when verified price and cost evidence are available. Activity includes deposits, withdrawals and trades. Sell stock positions to USDT, then withdraw USDT to a BSC wallet.

MegaFuel sponsors eligible approvals and USDT transfers when a funded private policy accepts them. Direct **Trade** is the sponsored purchase flow. The website **Agent** uses its separately reviewed approval flow, which can require BNB. English, Chinese, Spanish, French and Portuguese are supported, with light/dark themes and reduced motion.

## Integrations and execution boundaries

| Integration | FirstBell use | Implementation |
| --- | --- | --- |
| Binance Market API | Token prices, OHLC candles and portfolio changes | `worker/market.ts`, `worker/portfolio-market.ts` |
| Binance RWA Data API | Exact-contract Ondo token price, underlying reference and market session | `worker/binance-rwa.ts` |
| Binance Trading API | Quotes, RFQ build, submission and order status | `worker/binance-trading.ts`, `worker/agent-trading.ts` |
| Binance Transaction API | Approval simulation in the self-paid Agent path | `worker/agent-trading.ts` |
| Binance Wallet API | Address transaction history for portfolio activity | `worker/wallet-activity.ts` |
| Binance Address Portfolio | Cost-basis/PnL evidence, with independently verified settlement recovery | `worker/wallet-activity.ts`, `worker/wallet-purchase-basis.ts` |
| Binance Wallet Skills | Contract resolution, multiplier-aware stock research, token status and audit checks | `worker/wallet-skills.ts`, `lib/binance-wallet-skills.ts` |
| Binance Agentic Wallet | Optional personal CLI/MCP wallet connector with a local confirmation page | `agent-runtime/` |
| CoW Protocol | Reviewed RFQ settlement; direct BNB quote fallback at the user's exact amount | `worker/cow-trading.ts` |
| Privy / Onramper / MegaFuel | Login and wallet / fiat funding / eligible gas sponsorship | [Deployment](docs/vercel-deployment.md), [funding](docs/onramper-setup.md), [gas](docs/gas-sponsorship.md) |

Binance Transaction API broadcasting is **not** used: sponsored transactions relay through MegaFuel, and RFQ settlement is performed by the provider/solver. Browser balances are read independently from BSC RPC. The website Agent is a deterministic command parser; an external AI client supplies the LLM for the optional personal MCP connector. Its Binance wallet is separate from the website's Privy wallet. BNB Agent Studio, x402/b402 and autonomous strategies are not implemented.

Only validated CoW Order EIP-712 signing is enabled. Missing or below-minimum Binance routes may request a direct CoW quote for the same wallet, contracts and amount; provider restrictions and market-closure errors are not bypassed. Listing a token does not guarantee liquidity, eligibility or a $1 trade. An acknowledgement or approval is not a fill: Filled requires an independently verified successful BSC settlement and matching token transfers. Failed orders remain in history; open orders exclude terminal states. Ambiguous submitted transactions require reconciliation of the same attempt.

## What is verified, and what remains

Public checks on 2026-10-08 returned a ready Binance NVDAon market feed with 100 candles, a ready Binance RWA readout, and Apple stock research through Wallet Skills. Binance explicitly reports that it does not cover this Apple token's audit. The Agent shows **Not covered**, preserves the stock data and requires an explicit acknowledgement before confirming a reviewed trade with that limitation. Missing/error responses, unavailable trading status and level-5 risk still block execution. These public reads do not prove an authenticated trade, card payment or funded gas policy.

The website **Agent** appears after Google/email sign-in. Its direct link shows a sign-in prompt while signed out, and logging out closes the workspace. **History** saves conversations and research snapshots on the current device, separately for each signed-in user and wallet. **New Conversation** preserves earlier chats; saved research can be refreshed. The **Wallet orders** tab shows the wallet's existing order records and amounts. Reloading history never restores a trade approval, signature or executable plan.

The code includes reviewed buys/sells, receipt verification, activity recovery, USDT withdrawals and a personal Agentic Wallet connector. Before submission, attach the builder's real BSC transaction evidence, verify the funded 0-BNB sponsor flow if claiming it, and review the firsthand Developer Experience report. A user-reported purchase without a verifiable transaction link is not independent submission proof. Use the [checklist](docs/submission-checklist.md) for the remaining steps.

## Run and validate

Use **Node.js 24**. For the landing and frontend:

```sh
npm ci
npm run dev
```

Vite alone does not run `/api/*`. For the full deployed service, follow the [Vercel guide](docs/vercel-deployment.md); `server/vercel.ts` adapts the shared API to Node and Upstash Redis. The existing `server-test` project layout remains supported. The Cloudflare adapter is retained for compatibility and local Worker development, not as the primary judge URL.

```sh
npm run build
npm test
```

To include the optional personal connector's real MCP transport check:

```sh
npm ci --prefix agent-runtime --ignore-scripts
npm run agent:check
npm test
```

Tests use provider/RPC fixtures unless explicitly stated. They verify validation and state handling; they do not spend funds or establish live provider acceptance. GitHub CI builds the project and runs the suite with the optional connector installed. [Connector setup and confirmation boundaries](docs/binance-wallet-skills.md).

For a read-only Binance hosting comparison, run `node scripts/check-binance-market.mjs`. It prompts for credentials with hidden input and does not save them. The historical protected comparison service is documented in [server-test/README.md](server-test/README.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `src/`, `components/`, `lib/` | Landing, app, shared UI and client validation |
| `worker/`, `server/`, `api/` | Shared handlers, Vercel adapter and required generated API entry |
| `agent-runtime/` | Personal Binance Agentic Wallet connector |
| `tests/`, `.github/workflows/` | Regression checks and CI |
| `docs/` | Setup, evidence, submission checklist and recording guide |
| `asset-sources.json`, `brand-mark-sources.json`, `third_party/` | Issuer contracts, asset provenance and upstream licenses |

Server credentials belong in the host's private environment configuration, never `VITE_` variables or Git. Only the public Privy App ID is a frontend build setting. Issuer terms determine token rights and regional availability; the company logo is not proof of share ownership. Source attribution for the adapted React Bits and Spectrum UI components is retained in `third_party/`.
