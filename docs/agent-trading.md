# Plain-language wallet trading

Open `/app/?tab=agent`, log in with Google or email, and use the embedded Privy wallet.

Supported examples:

- `Buy $10 of Nvidia` or `Buy AAPL with 10 USDT` (the amount is USDT to spend).
- `Sell 0.1 TSLAon`, `Sell half my Tesla`, or `Sell all my Nvidia` (the amount is token quantity).
- `Buy $10 Nvidia, quote only` (no order or wallet signature).
- `Show my balance`, `Show my holdings`, or `Check order status`.
- Issuer, contract and network questions still use the issuer-published catalog.

This is a fixed command parser, not a connected LLM or autonomous strategy runtime. It needs no additional model API key. Conditional/scheduled trades, transfers, multiple assets and ambiguous amounts are rejected. English and Chinese commands are supported. Quotes, balances and fills are never invented for a demo.

## Execution

The app resolves catalog names to exact Ondo token contracts on BSC mainnet (chain 56). It verifies the Privy session and embedded-wallet ownership, checks the real input balance, requests a Binance RFQ quote and builds the order. Supported execution uses only `CowSwap` and the published CoW Protocol `Order` EIP-712 schema; other vendors remain available to the read-only Trade route checker. Unsupported typed-data representations, including raw hashes, fail closed.

The review shows spend, quoted receive, minimum receive, included fee, route, wallet, network and expiry. Slippage is fixed at 0.5%; the signed minimum cannot be lower than that threshold. No browser or server background task signs for the user.

If token permission is missing, FirstBell constructs and simulates an exact-amount ERC-20 approval for the published CoW vault relayer. A smaller existing permission is reset first. Privy shows its confirmation UI, and FirstBell waits for two confirmations. The user then refreshes and reviews a new order before signing. Permission approval is not a completed trade. Network fees use BNB.

After explicit confirmation, Privy signs the audited order. The server verifies that signature against the bound wallet and submits using `rfq.orderId` and a stable UUID `requestId`. Response loss offers an explicit same-submission retry; it never creates a replacement request ID automatically. Binance order status is polled. FirstBell reports a fill only after two BSC confirmations and independent verification of the wallet's input/output token transfers through the pinned settlement contract.

The latest known order receipt ticket is kept in this browser per wallet for status recovery after reload. Its server signature binds it to the authenticated account, wallet and order. Pending, confirming, filled, failed, expired, cancelled and unknown submission states remain distinct.

## Configuration and verification

Use the existing server configuration: `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_SECRET_KEY`, `PRIVY_APP_ID` and either Privy identity tokens or a valid `PRIVY_APP_SECRET` for server lookup. The existing account storage supplies per-account rate limits. Do not expose server secrets in Vite environment variables. The app checks provider trading availability and never circumvents provider restrictions.

Local tests use an unfunded fixture wallet and mocked provider/RPC responses. They establish request signing, validation and confirmation logic, not live provider eligibility or an actual trade. A complete live demonstration requires valid provider credentials, a verified Privy wallet, real BSC USDT, and BNB for any permission transaction. Onramper's UI-only sandbox preview supplies no mainnet trading funds.

Official references:

- [Hackathon track](https://www.bnbchain.org/en/hackathons/tokenized-stocks)
- [Binance Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api)
- [Binance integration flow](https://web3.binance.com/en/dev-docs/products/trading-api/integration-flow)
- [Binance transaction simulation](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api)
- [CoW deployment addresses](https://docs.cow.fi/cow-protocol/reference/contracts/core)
- [Privy typed-data signing](https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data)
- [Privy sending transactions](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction)

Binance Agentic Wallet, Wallet Skills and the CLI are not used by this app flow. It integrates Binance REST execution with the existing Privy wallet rather than provisioning a separate wallet.
