# FirstBell developer experience field log

**Hackathon:** BNB Hack: Tokenized Stocks Edition  
**Judging weight:** 25% for the Developer Experience Report  
**Status:** Living evidence log, not a finished submission  
**Last updated:** 2026-09-30 (UTC)

The [official brief](https://www.bnbchain.org/en/hackathons/tokenized-stocks) requests firsthand, specific feedback on onboarding, documentation, API pitfalls, the AI stack, tokenized stock behavior, redesigns, and requested capabilities. It explicitly rejects perfunctory or AI-generated reports. Keep this file as an evidence ledger; the final submission must be reviewed and written from actual developer experience. Do not turn an untested hypothesis into an observed defect.

## Project and eligibility status

FirstBell is a mobile-first research and trade interface for five Ondo tokenized equities on BSC. The backend uses Privy authentication, BSC RPC balance reads, Ondo primary-market data and soft quotes when configured, a labeled GeckoTerminal DEX pool fallback for public charts, and a signed Binance Web3 RWA Data readout when configured. The first market and quote work was pushed in [commit `fe2b71d`](https://github.com/ahmardchain/FirstBell/commit/fe2b71d2c5899e796a9a3cd928e5a81da37607fc).

**Important verification gap:** The hackathon requires a working project built on at least one **Binance Web3 API module**. FirstBell now contains the signed Binance RWA Data code path, but there is no configured developer key or recorded successful live call or deployed verification. Code and mocked tests alone do not prove the hackathon requirement is met. Ondo and GeckoTerminal do not count as Binance Web3 API modules.

## 2026-09-30: Binance Web3 RWA Data implementation

| Area | Firsthand evidence | Limit |
| --- | --- | --- |
| Documentation read | [Authentication](https://web3.binance.com/en/dev-docs/authentication) specifies `timestamp + method + requestPath + body`, Base64 HMAC-SHA256, with `/build` included in the signed path. [RWA Data](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data) lists `/rwa/price` and `/rwa/underlying-market` for chain 56 and a token contract. | These are documented contracts, not an observed API response. No documentation error has been confirmed. |
| Implementation | `worker/binance-rwa.ts` signs requests server-side and checks the exact BSC contract and `platformId: ondo`. It normalizes token price, a per-share reference and underlying market session without treating that session as token tradability. `/api/rwa/:symbol` returns explicit configuration or provider unavailable states. | `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY` have not been configured here. Runtime behavior against Binance is unverified. |
| Validation | `node --test tests/market.test.mjs tests/binance-rwa.test.mjs`: 7 passed, 0 failed, including an independent Node HMAC comparison, wrong-chain/issuer rejection and partial upstream failure. `npm run build` passed. `npx wrangler deploy --dry-run` passed and bundled the Worker. | All Binance responses were mocked. No real request timing, status code, rate-limit behavior or successful live call is measured. |

**Specific integration decision:** The RWA `referencePrice` is documented as a per-share conversion derived from the on-chain token price, not an official traditional exchange quote. FirstBell labels it accordingly and does not compute a misleading "on-chain vs stock exchange" spread from it. This is an interpretation of the documented field, to be checked against a live response.

## 2026-09-30: Market data and trade estimate backend

| Area | Firsthand evidence | Limit |
| --- | --- | --- |
| Implementation | `worker/market.ts` normalizes Ondo token primary-market price and OHLC; a public DEX fallback selects a BSC pool containing the exact listed token contract and at least $10,000 reported reserve. The response names its provider and timestamp. | Code path verified with fixtures; live provider availability not established. A pool price and Ondo primary price are different markets. |
| Quote path | `POST /api/trade/quote` verifies a Privy access token, requires `ONDO_API_KEY`, rate limits to six requests per account per minute, validates Ondo's soft-quote chain, symbol, contract, side and token units, then returns an `executable: false` estimate. | No production Ondo key was available in this workspace. No real quote was obtained, no eligibility check or transaction executed. |
| Error behavior | Unknown symbols and timeframes return 400; missing feeds return 503 with `status: unavailable`; missing auth returns 401; missing secrets return 503. The UI shows an explicit unavailable state. | These response paths are implemented; end-to-end deployed behavior has not been checked. |
| Automated checks | `node --test tests/market.test.mjs`: 3 passed, 0 failed, using mocked Ondo and GeckoTerminal responses. `npm run build`: passed. `npx wrangler deploy --dry-run`: passed and recognized account Durable Object and static assets. | Fixtures are not a successful external API call. Build success is not proof of a live deploy. |
| Deployment | `npx wrangler whoami` reported that the CLI was not authenticated. Source was pushed to GitHub main. | Cloudflare Worker was not deployed from this workspace and no production request was measured. |

### Onboarding

- **Binance Web3 API:** RWA Data signer and parser implemented with fixtures. No developer portal key, first successful live call, or elapsed onboarding time recorded yet. The `/build` signing detail was found in the Authentication docs before making a live request, so it is **not** a firsthand 40102 incident.
- **Ondo:** Its documented market and OHLC routes and soft quote contract were implemented behind a Worker secret. The key must be obtained through Ondo onboarding; no key or successful live request was available here. Time from docs to first live response is **not measured**.
- **GeckoTerminal:** A public fallback was implemented against documented pool and OHLC shapes. Only fixture responses were tested here; no live latency or pool availability was measured.
- **Privy:** Frontend login and backend JWT verification were implemented earlier. No successful deployed verification request is recorded in this log.

### Documentation issues and API pitfalls

No documentation error has been confirmed by a live request. Do not claim one. While designing the integration, the [Ondo market-data documentation](https://docs.ondo.finance/api-reference/assets/get-market-data-for-an-asset) clearly separated token primary-market prices from underlying stock prices and stated that display prices are not execution prices. The [soft-quote documentation](https://docs.ondo.finance/api-reference/attestations/request-a-soft-attestation-quote) describes an indicative quote, which does not provide a binding transaction by itself. This is a product boundary we enforced, not a documentation bug.

The implementation validates decimal token amounts without floating-point arithmetic and rejects a provider response if its asset address, BSC chain ID, side or amount differs from the request. This came from threat modeling and the documented response format; it is **not** evidence of those mismatches occurring in production.

No actual status code, confusing error response, rate limit, or p95 latency from the Binance Web3 API has been observed. Add exact endpoint, sanitized request shape, response code/body, timestamp and repeatable steps after a real call. The docs explicitly warn that omitting `/build` from the signature yields `40102`; our mock test proves the signed path includes it, but we have not seen that error ourselves.

### AI stack feedback

- Binance Agentic Wallet: **not used**.
- Binance Wallet Skills: **not used**.
- Binance CLI: **not used**.
- AI assistance helped inspect documentation and write integration code and tests. That is not a test of Binance's AI wallet stack. No claims about its usability or failures are ready for submission.

### Tokenized stock observations

No firsthand liquidity depth, slippage, out-of-hours behavior, on-chain/reference spread, or comparison between bStocks, Ondo and xStocks has been measured yet. FirstBell's DEX fallback requires a reported pool reserve of at least $10,000 and labels its source; this is a defensive display rule, **not** a liquidity study or proof that a swap can fill. The chart must not be presented as an executable price.

### Redesign ideas to validate during Binance integration

These are requests for investigation, not conclusions about the existing Binance platform:

1. Try the official first-call journey from portal sign-in through a signed RWA data request. If any step takes manual inference, record the exact page and propose a copyable request with safe sample credentials and response fields.
2. Check whether RWA market/reference values expose timestamps and trading-session status together. If not, propose a single response that includes both so weekend gaps cannot be misread.
3. Compare a displayed market price, a routed swap quote, and a simulated transaction. Record where the docs explain freshness, slippage and approval requirements; propose explicit field names if the contract is ambiguous.

## Next evidence to collect

1. Obtain a Binance Web3 developer API Key and Secret Key, configure both as Worker runtime secrets, deploy, and call `/api/rwa/NVDAon`. Time the first successful signed Binance request from opening the docs and save a sanitized response and request ID if supplied. Confirm the expected contract, chain 56 and issuer in the returned data.
2. Record one successful and one failed call for every integrated module, including endpoint, code, response text, duration, and what the docs led us to expect. Keep secrets, wallet tokens and personal data out of this report.
3. With a configured Ondo key, test all five symbols' market, OHLC and soft quote paths on a deployed Worker. Note missing sessions or symbol-specific behavior; do not infer fills from quotes.
4. Measure actual DEX depth and simulated price impact for a small BSC spot trade. Compare token-market and underlying reference timestamps during and outside market hours; record methodology and time zone.
5. Try Binance Agentic Wallet, Wallet Skills or CLI if used in the build. Record install command, version, first successful action, exact failure and recovery. Otherwise retain the honest “not used” entries.

### Entry template for every future integration session

| Field | Record |
| --- | --- |
| Date/time and timezone | |
| Module, endpoint, docs URL and section | |
| Goal and sanitized request | |
| Time from docs to first success | |
| HTTP status, relevant response fields, latency | |
| Exact blocker, reproduction steps, recovery | |
| Token symbol, BSC contract, market session | |
| Expected vs observed behavior | |
| Suggested documentation or API change | |
| Commit, test and deployed evidence | |

Update this log immediately after each real integration session. Mark untested ideas clearly and retain failed attempts; the failures are useful developer feedback.

## 2026-09-30: Card funding integration and interrupted-work recovery

- Implemented a hosted MoonPay handoff for the authenticated Privy embedded EVM wallet. Documents reviewed: [URL integration](https://dev.moonpay.com/widget/on-ramp/integration-methods/url), [IP matching](https://dev.moonpay.com/widget/on-ramp/customization/ip-matching), [external transaction lookup](https://dev.moonpay.com/api-reference/widget/getbuytransactionbyexternalid), [currencies](https://dev.moonpay.com/api-reference/widget/getcurrencies), and [Privy identity tokens](https://docs.privy.io/user-management/users/identity-tokens). The checkout signs the complete query and an HMAC of the edge-observed IP, verifies a separate identity token for wallet ownership, and fixes the receiving asset to BSC USDT (`usdt_bsc`, chain 56, `0x55d398326f99059ff775485246999027b3197955`, 18 decimals).
- Endpoints: `GET https://api.moonpay.com/v3/currencies?show=enabled&apiKey=<publishable-key>` and `GET https://api.moonpay.com/v1/transactions/ext/<server-generated-id>?apiKey=<publishable-key>`. No approved partner keys were available to this implementation session. Time to first authenticated provider success and live payment latency: **not measured**. No card charge or delivery has been performed or verified.
- Sanitized mocked result: a matching provider `status: completed`, `quoteCurrencyAmount: 47`, and transaction hash stays `confirming` until a successful chain-56 receipt contains 47 USDT to the receiving wallet with three confirmations. Only then does the stored status become `completed` and `receivedAmount: "47"`. Mismatched wallet, token, chain, customer, fiat amount, or multiple provider orders are rejected. This is fixture evidence, not a live transaction.
- Recovery fixes: the selected older pending deposit now takes polling priority; locally expired checkouts remain stored and checkable because a local timeout cannot cancel a provider checkout; user data is refreshed before retrieving the wallet identity token. A regression test verifies a late provider payment changes an expired record back to processing without crediting funds.
- Verification: backend tests, TypeScript/production build, and Cloudflare deployment dry run pass. The local browser checker could not start: `Failed to bind socket: Operation not permitted (os error 1)`. Desktop/mobile rendering and an authenticated live checkout remain **unverified**.
- Documentation observation: the external-ID endpoint prose describes an array while its displayed 200 example shows an object. The parser accepts either and refuses ambiguous multiple orders. This is a documented-shape observation; no real inconsistent response has been encountered. Suggested improvement: show an array example that matches the declared response and explain repeat-checkout behavior for an existing external ID.
- Binance Agentic Wallet, Wallet Skills, and CLI: **not used** in card funding. The stock's trading session is not relevant to a USDT deposit; stock execution, BNB gas funding/sponsorship, and withdrawals remain separate work.

## 2026-09-30: Separate MoonPay sandbox checkout

- Documents reviewed: [sandbox testing](https://dev.moonpay.com/widget/sandbox-testing), [currencies](https://dev.moonpay.com/api-reference/widget/getcurrencies), and the [hackathon brief](https://www.bnbchain.org/en/hackathons/tokenized-stocks). The sandbox guide specifies native ETH delivery on Sepolia and delivery of 1/100 of the quoted amount. These are documented behaviors; no test purchase has been completed here.
- Public catalog observation: `GET https://api.moonpay.com/v3/currencies?show=all` listed `eth` with `supportsTestMode: true`, Ethereum network metadata and chain ID 1; `usdt_bsc` had `supportsTestMode: false`, chain 56 and contract `0x55d398326f99059ff775485246999027b3197955`. This was a public catalog read, not an account-specific enabled-assets response. Response latency was not recorded. The distinction between catalog metadata and sandbox delivery network informed the implementation.
- Implementation: sandbox signs `currencyCode=eth` for `https://buy-sandbox.moonpay.com/`; live retains `usdt_bsc` for BSC. New persisted sessions record their currency. The enabled-currency endpoint and external-ID lookup remain as listed in the previous entry. Mode or asset changes prevent resuming or polling a session under different keys. Portfolio continues to read actual BSC balances independently.
- Sanitized fixture evidence: a matching ETH sandbox order with `status: completed` becomes `test_completed`, with `receivedAmount: null`, without any BSC RPC confirmation request or balance write. BSC USDT is rejected as a sandbox asset. Existing live sessions remain stored after a switch to sandbox. These are mocked responses, not observed provider transactions.
- Validation: `npm test` passed all 25 tests; TypeScript and Vite production build passed; `npx --yes wrangler@4.144.0 deploy --dry-run` passed. The cloud preview browser could not open the loopback preview URL and reported `net::ERR_BLOCKED_BY_CLIENT`. Rendered desktop/mobile appearance and authenticated hosted checkout remain **unverified**. No Cloudflare deployment was performed from this workspace.
- Onboarding and latency: no matching MoonPay test keys were supplied, so time to first authenticated success and payment/delivery latency are **not measured**. Configure matching test keys and Ethereum in the partner integration, then record an actual enabled-catalog response, completed checkout, status lookup and Sepolia hash before claiming successful integration.
- Actionable documentation suggestion: add a sandbox-network field or an example mapping `eth` catalog metadata to Sepolia delivery beside the currency catalog example. This would make the documented distinction easier to discover; no incorrect production response or provider defect is claimed.
- Binance Agentic Wallet, Wallet Skills and CLI: **not used**. Stock execution remains unfinished; the current Ondo ticket returns an indicative, non-executable estimate. A separately funded wallet does not establish a completed stock trade or production card funding.

## 2026-09-30 UTC: Binance route-check candidate for the existing Ondo catalog

- Documents reviewed: [Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), specifically **Get Aggregator Supported Chains**, **Get Aggregated Quote**, **Get ERC-20 Approve Transaction**, **Build Swap Transaction**, and **Submit RFQ Order**. The documented quote parameters require the receiving wallet for equities. The quote and swap sections describe equities as `executionMode: RFQ`, followed by a user EIP-712 signature and relayer order submission. These are documented requirements, not observed trading behavior.
- Implemented read-only endpoints: `GET https://web3.binance.com/build/api/v1/dex/aggregator/supported/chain?binanceChainId=56` and `GET https://web3.binance.com/build/api/v1/dex/aggregator/quote?binanceChainId=56&amount=<integer-units>&fromTokenAddress=<exact-contract>&toTokenAddress=<exact-contract>&userWalletAddress=<verified-wallet>`. Signed headers reuse the existing HMAC signer; only Binance runtime credentials are required. BSC RPC verifies chain 56 and the selected token's decimals. The app route `/api/trade/route` authenticates the account, proves embedded-wallet ownership and shares a serialized account quote-rate limit.
- Token context: the current five Ondo BSC contracts remain unchanged. A Buy check spends BSC USDT (`0x55d398326f99059ff775485246999027b3197955`, 18 decimals); a Sell check uses the chosen stock token's on-chain decimals. Underlying market-session data does not establish quote availability or eligibility. No liquidity study, price-impact measurement, market-hours comparison or xStocks migration has occurred.
- Sanitized fixture evidence: a 5 USDT request encodes `amount=5000000000000000000`, includes the owned wallet and receives a matching RFQ route with output `25000000000000000` at 18 decimals. The displayed estimate is `0.025 NVDAon`, `executable: false`, with no quote ID, signing payload or transaction returned. A six-decimal Sell fixture verifies precision handling; this fixture is not a claim that the deployed NVDAon contract has six decimals. Wrong network, contracts, amounts, decimals and ordinary-swap modes are rejected; stale responses cannot establish a current route. These tests use mocked Binance and RPC responses.
- Validation: `npm test` passed all 31 tests, including six new Binance route-check tests and the existing MoonPay tests. TypeScript, Vite production build and `npx --yes wrangler@4.144.0 deploy --dry-run` passed. The browser's local-preview restriction recorded above remains unresolved, so rendered UI behavior is unverified. The sheet preserves the existing design and explicitly states that it does not place an order.
- Live access: neither Binance credential was available in the workspace. Read-only attempts to `https://firstbell.ahmardchain.workers.dev/api/health` and `/api/rwa/NVDAon` returned HTTP 403 with a non-JSON body from this request path. This does **not** establish whether the deployed Worker has keys, whether Binance rejected a request, or whether an Ondo token is routable. No authenticated quote, first-success time or provider latency was measured. No wallet signature, approval, submission, broadcast or stock trade occurred.
- Recovery and next evidence: configure the two Binance runtime secrets, deploy the source and check a route from the real signed-in wallet. Record a sanitized quote result and timing or the actual provider error code from Worker logs. If a verified BSC route cannot be obtained, compare a verified xStocks contract rather than assuming either issuer works. The real RFQ signing/approval/submission/settlement flow remains unfinished.
- Actionable documentation suggestion: the quote `vendor` selector lists `LiquidMesh`, `Pancake` and `Jupiter`, while the approval section tells equity users to pass the returned RFQ `vendorName`, such as `PcsXRfq`. Add a complete BSC stock example that distinguishes the quote selector from the approval/order vendor and shows the RFQ response fields. This is a documentation-read observation, not a firsthand failed request.
- Binance Agentic Wallet, Wallet Skills and CLI: **not used**. AI-assisted code and this living evidence ledger are not a finished Developer Experience Report; the final submission still needs the builder's firsthand review.
