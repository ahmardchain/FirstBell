# FirstBell developer experience field log

**Hackathon:** BNB Hack: Tokenized Stocks Edition  
**Judging weight:** 25% for the Developer Experience Report  
**Status:** Living evidence log, not a finished submission  
**Last updated:** 2026-09-30 (UTC)

The [official brief](https://www.bnbchain.org/en/hackathons/tokenized-stocks) requests firsthand, specific feedback on onboarding, documentation, API pitfalls, the AI stack, tokenized stock behavior, redesigns, and requested capabilities. It explicitly rejects perfunctory or AI-generated reports. Keep this file as an evidence ledger; the final submission must be reviewed and written from actual developer experience. Do not turn an untested hypothesis into an observed defect.

## Project and eligibility status

FirstBell is a mobile-first research and trade interface for five Ondo tokenized equities on BSC. The current backend uses Privy authentication, BSC RPC balance reads, Ondo primary-market data and soft quotes when configured, and a labeled GeckoTerminal DEX pool fallback for public charts. The market and quote work was pushed in [commit `fe2b71d`](https://github.com/ahmardchain/FirstBell/commit/fe2b71d2c5899e796a9a3cd928e5a81da37607fc).

**Important eligibility gap:** The hackathon requires a working project built on at least one **Binance Web3 API module**. FirstBell has not yet integrated a Binance Web3 API module. Ondo and GeckoTerminal do not satisfy that requirement. A future Binance integration must be implemented and actually exercised before the report describes its developer experience.

## 2026-09-30: Market data and trade estimate backend

| Area | Firsthand evidence | Limit |
| --- | --- | --- |
| Implementation | `worker/market.ts` normalizes Ondo token primary-market price and OHLC; a public DEX fallback selects a BSC pool containing the exact listed token contract and at least $10,000 reported reserve. The response names its provider and timestamp. | Code path verified with fixtures; live provider availability not established. A pool price and Ondo primary price are different markets. |
| Quote path | `POST /api/trade/quote` verifies a Privy access token, requires `ONDO_API_KEY`, rate limits to six requests per account per minute, validates Ondo's soft-quote chain, symbol, contract, side and token units, then returns an `executable: false` estimate. | No production Ondo key was available in this workspace. No real quote was obtained, no eligibility check or transaction executed. |
| Error behavior | Unknown symbols and timeframes return 400; missing feeds return 503 with `status: unavailable`; missing auth returns 401; missing secrets return 503. The UI shows an explicit unavailable state. | These response paths are implemented; end-to-end deployed behavior has not been checked. |
| Automated checks | `node --test tests/market.test.mjs`: 3 passed, 0 failed, using mocked Ondo and GeckoTerminal responses. `npm run build`: passed. `npx wrangler deploy --dry-run`: passed and recognized account Durable Object and static assets. | Fixtures are not a successful external API call. Build success is not proof of a live deploy. |
| Deployment | `npx wrangler whoami` reported that the CLI was not authenticated. Source was pushed to GitHub main. | Cloudflare Worker was not deployed from this workspace and no production request was measured. |

### Onboarding

- **Binance Web3 API:** Not started. No developer portal key, request signature, first successful call, or elapsed time recorded yet.
- **Ondo:** Its documented market and OHLC routes and soft quote contract were implemented behind a Worker secret. The key must be obtained through Ondo onboarding; no key or successful live request was available here. Time from docs to first live response is **not measured**.
- **GeckoTerminal:** A public fallback was implemented against documented pool and OHLC shapes. Only fixture responses were tested here; no live latency or pool availability was measured.
- **Privy:** Frontend login and backend JWT verification were implemented earlier. No successful deployed verification request is recorded in this log.

### Documentation issues and API pitfalls

No documentation error has been confirmed by a live request. Do not claim one. While designing the integration, the [Ondo market-data documentation](https://docs.ondo.finance/api-reference/assets/get-market-data-for-an-asset) clearly separated token primary-market prices from underlying stock prices and stated that display prices are not execution prices. The [soft-quote documentation](https://docs.ondo.finance/api-reference/attestations/request-a-soft-attestation-quote) describes an indicative quote, which does not provide a binding transaction by itself. This is a product boundary we enforced, not a documentation bug.

The implementation validates decimal token amounts without floating-point arithmetic and rejects a provider response if its asset address, BSC chain ID, side or amount differs from the request. This came from threat modeling and the documented response format; it is **not** evidence of those mismatches occurring in production.

No actual status code, confusing error response, rate limit, or p95 latency from the Binance Web3 API has been observed. Add exact endpoint, sanitized request shape, response code/body, timestamp and repeatable steps after a real call.

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

1. Obtain a Binance Web3 developer key and implement at least one real module (RWA Data is the most relevant starting point). Time the first successful signed request from opening the docs. Save a sanitized response and request ID if supplied.
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
