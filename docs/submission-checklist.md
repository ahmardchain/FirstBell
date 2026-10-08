# FirstBell submission checklist

Based on the [official BNB Hack: Tokenized Stocks Edition brief](https://www.bnbchain.org/en/hackathons/tokenized-stocks?tab=tracks), checked 2026-10-08. Submission closes **11 October 2026 at 12:00 UTC / 13:00 Africa/Lagos**. Keep public links accessible through judging, **12–23 October**.

## Requirements

| Requirement | FirstBell evidence or remaining action |
| --- | --- |
| Public repository | [ahmardchain/FirstBell](https://github.com/ahmardchain/FirstBell), public |
| Working project using Binance Web3 API | Public Market and RWA reads verified; signed Trading, Transaction and Wallet paths are in source. Authenticated execution evidence is separate. |
| bStocks, Ondo or xStocks central | Pinned Ondo BSC token catalog drives Home, Trade and portfolio contract validation. |
| BSC mainnet, spot only | Chain 56 and spot RFQ order validation are implemented. Attach an actual completed purchase's BscScan hash, token contract and resulting position. This audit did not sign or submit a trade. |
| Deployed link or reproducible judge instructions | [Website](https://firstbell-server-test.vercel.app/) and [app](https://firstbell-server-test.vercel.app/app/); setup in README and deployment guide. The Agent interface requires Google/email sign-in; the public research API remains readable without an account. Trading uses the judge's own supported account and funds. |
| Developer Experience report | Existing [firsthand field log](developer-experience-report.md) preserved. Builder must review the final report against actual experience and complete the organizer's [report form](https://forms.gle/EUQ39xf54GHjC2ys5). The brief rejects perfunctory or AI-generated reports; this checklist is not a substitute report. |
| Video, optional but strongly recommended | Record four minutes or less using the [demo guide](demo-guide.md); add the real accessible URL after upload. |
| Eligibility and one entry per team | Builder must confirm registration, regional eligibility and applicable rules in the official brief. A repository cannot establish residency/citizenship or registration. |

## Judging evidence

| Criterion | Weight | What to show |
| --- | --- | --- |
| Technical implementation | 30% | Correct contracts/chain/units, real Binance data, owned wallet, explicit review, minimum receive, failure states, durable history and independently verified settlement. CI checks code; a BscScan receipt proves the live transaction. |
| Creativity and originality | 25% | The coherent newcomer journey: familiar login, local-currency funding, stock-specific RWA context, exact-amount route fallback, supported gas sponsorship and portfolio tracking. Show the product decisions and their actual behavior. |
| Developer Experience report | 25% | Builder's own precise onboarding times, documentation/API problems, tokenized-stock observations, Wallet Skills/CLI experience and actionable improvements. Preserve failure evidence and label fixtures. |
| Product quality and UX | 20% | A clear first-purchase flow, readable review, honest unavailable states, mobile layout, five languages, activity/history and USDT withdrawals. |

## Special prizes

| Prize | Amount | Current boundary |
| --- | --- | --- |
| Agentic Wallet / Wallet Skills | $2,000 | Official skill-contract research is implemented; separate CLI/MCP connector and local confirmation exist. Add personally verified wallet connection, controls and receipt evidence before claiming live Agentic Wallet execution. A chat screen alone is insufficient evidence of depth. |
| BNB Agent Studio | $2,000 | Not integrated. Do not claim its identity/runtime/payment features. It is optional for the main track. |

## Final evidence to supply

- [ ] Mainnet purchase: actual successful BSC receipt, exact stock contract and amount, correct wallet, Filled history and current position. The builder has reported a purchase; its public proof still needs to be supplied.
- [ ] Transaction API dry-run: retain a real simulation result before the live demonstration, as the brief requests. The self-paid Agent approval path uses Binance simulation; direct sponsored approval uses BSC RPC simulation. Fixture tests alone do not establish the requested live dry-run.
- [ ] If claiming no extra BNB: initial 0-wei BNB balance, sponsor-approved receipt and final 0 BNB balance for the shown flow. Direct Trade and the Agent approval path differ; see [gas coverage](gas-sponsorship.md).
- [ ] If claiming live card-to-stock: completed live Onramper payment and matching BSC USDT delivery before the stock purchase. Otherwise disclose sandbox checkout and separate real funding.
- [ ] Withdrawal: distinguish a review from a personally confirmed, receipt-verified USDT transfer.
- [ ] Agentic Wallet: distinguish website research, fixture checks and actual personal Binance-wallet execution. Apple research's audit is explicitly unsupported; show **Not covered** and the acknowledgement required before a fresh review can be confirmed. Do not claim a verified audit, bypass missing/error checks or present a quote as a fill.
- [ ] Write the final Developer Experience submission in your own words from your actual experience, using the field log as supporting evidence. Dates in the log are historical observations, not assertions that old failures still occur today. Add your latest experience yourself.
- [ ] Upload the video; verify repo/app/video access while signed out; submit the [project form](https://forms.gle/yToDUzaDMwWnq6R6A) and report before the deadline.

## Public readiness check, 2026-10-08

The deployed health route returned HTTP 200. NVDAon market data returned `source: binance-web3`, a positive price and 100 candles; its RWA route returned `source: binance-web3-rwa`, a token/reference price and underlying market context. Apple research resolved its pinned chain-56 contract and returned stock metadata through Wallet Skills, but no usable audit rating. These are public read checks, not proofs of authenticated account state, payment, simulation, sponsor funding or completed execution.

The repository implements Transaction API **simulation**, not Binance broadcasting; sponsored approval simulation uses BSC RPC and relays through MegaFuel. Wallet API reads transaction history; portfolio balances use direct BSC RPC, with Address Portfolio and settlement evidence for cost basis. See README for exact source paths.
