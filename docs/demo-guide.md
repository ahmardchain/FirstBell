# FirstBell demo preparation

## Current readiness

- Implemented: Google/email login, embedded wallet, BSC on-chain balances, asset research, configured Binance RWA reads, and separate MoonPay sandbox/live checkout routes.
- Still to verify with actual credentials: a successful deployed MoonPay sandbox checkout and a genuine Binance Web3 API call.
- Still unfinished: executable stock buys/sells. The current trade ticket requests an Ondo indicative estimate and cannot submit a transaction. Do not record it as a completed purchase.

## Prepare card testing

Follow the [sandbox setup in README](../README.md#activate-sandbox-checkout-for-the-demo). Configure `pk_test_…`, the matching `sk_test_…`, and `MOONPAY_ENVIRONMENT=sandbox` in the Cloudflare Worker. Keep the Privy verification public key and identity-token option enabled. Do not send signing keys in chat or commit them.

Sign in with the identity you will use during recording. Check that Portfolio opens **Test card checkout** and that its dialog shows **ETH / Ethereum Sepolia**, the same wallet address, test-card instructions, and the selected payment amount. Complete the hosted MoonPay flow, return to FirstBell, and verify **Test completed** in Activity. Compare your BSC USDT balance before and after; sandbox checkout must not credit it.

## Prepare the mainnet trading proof

First complete and verify the actual stock execution path. The [hackathon rules](https://www.bnbchain.org/en/hackathons/tokenized-stocks) require BSC mainnet activity with small live amounts, a working integration with at least one Binance Web3 API module, and bStocks, Ondo, or xStocks central to the project.

Before any live purchase, copy the full receiving address for the signed-in embedded wallet. Confirm the sending network is **BNB Smart Chain / BSC (chain 56)**. Fund that address separately with real USDT on BSC and native BNB for transaction gas. Test checkout's Sepolia ETH cannot pay for BSC purchases or BSC gas. Wait for the actual balances to appear in Portfolio and verify them on BscScan.

Then simulate and review a small stock trade, approve it in the wallet, and record its genuine BSC transaction hash and resulting token balance. No transaction should be submitted without the user's explicit wallet approval. Document the actual API responses, timing and any errors in the developer-experience field log.

## Recording disclosure

Use this wording only after both parts have genuinely been completed:

> Card checkout uses MoonPay sandbox. This wallet was funded separately for the real BSC mainnet stock purchase.

Show the sandbox indicator while demonstrating checkout. Show the BSC transaction and actual token position during the live trading part. Do not attribute the pre-existing USDT to the test card payment or claim a working live card-to-stock flow. A mainnet trade provides trading evidence; the mixed demo does not establish production card funding, and no organizer exception has been obtained.
