# Plain-language wallet trading

Open `/app/?tab=agent`, log in with Google or email, and use the embedded Privy wallet.

Supported examples:

- `Buy $10 of Nvidia` or `Buy AAPL with 10 USDT` (the amount is USDT to spend).
- `Sell 0.1 TSLAon`, `Sell half my Tesla`, or `Sell all my Nvidia` (the amount is token quantity).
- `Buy $10 Nvidia, quote only` (no order or wallet signature).
- `Show my balance`, `Show my holdings`, or `Check order status`.
- Issuer, contract and network questions still use the issuer-published catalog.

This is a fixed command parser, not a connected LLM or autonomous strategy runtime. It needs no additional model API key. Conditional/scheduled trades, transfers, multiple assets and ambiguous amounts are rejected. English, Chinese, Spanish, French and Portuguese commands are supported. Quotes, balances and fills are never invented for a demo.

## Execution

The app resolves catalog names to exact Ondo token contracts on BSC mainnet (chain 56). It verifies the Privy session and embedded-wallet ownership, checks the real input balance, requests a Binance RFQ quote and builds the order. Supported execution uses only `CowSwap` and the published CoW Protocol `Order` EIP-712 schema; other vendors remain available to the read-only Trade route checker. Unsupported typed-data representations, including raw hashes, fail closed.

The review shows spend, quoted receive, minimum receive, included fee, route, wallet, network and expiry. Slippage is fixed at 0.5%; the signed minimum cannot be lower than that threshold. No browser or server background task signs for the user.

If token permission is missing, FirstBell constructs and simulates an exact-amount ERC-20 approval for the published CoW vault relayer. A smaller existing permission is reset first. Privy shows its confirmation UI, and FirstBell waits for two confirmations. The user then refreshes and reviews a new order before signing. Permission approval is not a completed trade. Network fees use BNB.

After explicit confirmation, Privy signs the validated order. The server verifies that signature against the bound wallet and submits using `rfq.orderId` and a stable UUID `requestId`. Response loss reconciles the original submission by reads; it never dispatches a replacement automatically. Binance order status is polled. FirstBell reports a fill only after two BSC confirmations and independent verification of the wallet's input/output token transfers through the pinned settlement contract.

The latest known order receipt ticket is kept in this browser per wallet for status recovery after reload. Its server signature binds it to the authenticated account, wallet and order. Pending, confirming, filled, failed, expired, cancelled and unknown submission states remain distinct.

## Quote latency

Buy quotes start alongside chain support, RPC chain verification and output-token decimals. Successful metadata is coalesced and cached for 60 seconds in each running instance; API support is scoped to the credential pair. Failed checks are not cached. Sell quotes wait for verified input decimals. Every request still obtains a fresh provider price and validates its timestamp, chain, contracts, amount and route.

Agent preparation overlaps fresh wallet balance and allowance reads with the quote, then overlaps the unsigned RFQ build with exact-amount approval simulation and gas checks when permission is needed. Both results must pass validation before a plan is returned. An unfunded buy cancels the pending quote immediately. Vercel's six-per-minute account limit uses one atomic Redis sliding-window command without loading or migrating account records.

The UI gives route checks 15 seconds and complete preparation 20 seconds, including session retrieval; the server budget ends one second earlier. Timed-out session retrieval cannot start a late API request. These limits return an error rather than inventing a price. Signed submissions and settlement recovery keep their separate behavior. `Server-Timing` records the total server duration; sanitized provider logs record support, quote, build and simulation durations without credentials, wallets or payloads.

The hackathon-linked Trading API docs advertise a one-call Flash API, but currently accept only `LiquidMesh` for that endpoint. Ondo tokens use RFQ, so this app retains `/quote` followed by `/swap`. General market/RWA prices are reference data and do not replace an executable quote. Local concurrency and expiry checks use network fixtures; they do not establish deployed Binance latency.

Binance error `40375` means the requested trade value is below the Ondo provider's minimum. The app returns `minimum_order_not_met` with a validated numeric `minimumUsd` when the provider supplies it, and shows that threshold in Trade and Agent. If no threshold can be extracted, it shows a general minimum-value message. The documented 20 USD value is an example, not a universal limit. The user chooses the revised amount and requests a new quote; FirstBell never raises the spend automatically or relays the raw provider message.

## Quote availability failures

Trade and Agent distinguish `liquidity_unavailable` (provider liquidity/route errors), `token_unavailable` (CoW rejects the token), and available Binance routes outside the enabled executor (`unsupported_execution_mode` or `unsupported_route_vendor`). Empty quote results remain `no_verified_route`; mismatched chain, contracts, decimals, amount, mode or quote identifiers fail as `invalid_provider_response`. Neither case is a completed trade.

The enabled executor still signs only the validated CoW Order schema. It may obtain a fresh direct CoW quote at the user's exact amount when Binance has no enabled route, liquidity or a usable minimum. If that fallback returns a valid quote, the user reviews it normally. If an available Binance route is not enabled and CoW has no liquidity or does not support the token, the final error explains the execution limitation. Authentication, region, market-closure, timeout and validation errors are not hidden behind that message. No SWAP transaction is signed or broadcast by this change, and no live $1 purchase is claimed.

## Configuration and verification

Use the existing server configuration: `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_SECRET_KEY`, `PRIVY_APP_ID` and either Privy identity tokens or a valid `PRIVY_APP_SECRET` for server lookup. The existing account storage supplies per-account rate limits. Do not expose server secrets in Vite environment variables. The app checks provider trading availability and never circumvents provider restrictions.

Local tests use an unfunded fixture wallet and mocked provider/RPC responses. They establish request signing, validation and confirmation logic, not live provider eligibility or an actual trade. A complete live demonstration requires valid provider credentials, a verified Privy wallet, real BSC USDT, and BNB for any permission transaction. Onramper's UI-only sandbox preview supplies no mainnet trading funds.

Official references:

- [Hackathon track](https://www.bnbchain.org/en/hackathons/tokenized-stocks)
- [Binance Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api)
- [Binance integration flow](https://web3.binance.com/en/dev-docs/products/trading-api/integration-flow)
- [Binance Trading API execution modes and Flash API](https://web3.binance.com/en/dev-docs/products/trading-api/introduction)
- [Binance Trading API minimum-order errors](https://web3.binance.com/en/dev-docs/products/trading-api/error-codes)
- [Binance transaction simulation](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api)
- [CoW deployment addresses](https://docs.cow.fi/cow-protocol/reference/contracts/core)
- [Privy typed-data signing](https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data)
- [Privy sending transactions](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction)

The website Agent checks official Wallet Skills stock identity, token status and audits before preparation and again before dispatch. An explicitly unsupported audit is labelled **Not covered** and requires the user's acknowledgement in each fresh review; missing/error responses and unavailable trading status remain blocked. Changed findings prevent dispatch and create a Failed record. Public research success does not imply route or small-order eligibility. **History** restores device-local conversations and saved research, never a trade approval, and shows existing wallet orders separately. This flow uses the Privy wallet, while the separate [personal Binance Agentic Wallet connector](binance-wallet-skills.md) uses the official CLI and its own wallet. Direct Trade is the MegaFuel-sponsored approval path; this Agent approval path can require BNB.
