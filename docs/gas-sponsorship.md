# FirstBell BSC gas sponsorship

## Coverage and current acceptance status

The direct Trade Confirm/Cancel flow supports NodeReal MegaFuel's **EOA paymaster** on BSC mainnet (chain 56). Privy remains an embedded EOA; no ERC-4337 account or seed-phrase flow is introduced.

Deposits, new trades and Portfolio cash use **BSC USDT** (`0x55d398326f99059ff775485246999027b3197955`, 18 decimals) only. Native BNB and USDC are not deposit choices. BNB remains the network and may pay fees for existing wallets when sponsorship is unconfigured. The existing card checkout keeps its BSC USDT product. The legacy Agent approval flow remains separately reviewed and self-paid; use direct Trade for sponsored purchases.

| Operation | Wallet gas requirement |
| --- | --- |
| First ERC-20 approval to the pinned CoW relayer | A funded FirstBell private policy must accept the exact `approve()` call |
| Reset an insufficient nonzero allowance, then approve the exact trade amount | Each approval is checked and sponsored separately |
| CoW RFQ stock order | User signs EIP-712 off-chain; the provider/solver settles on-chain. Trading/network costs can be included in the quoted order fee |
| Repeat trade with sufficient allowance | No approval transaction or paymaster call |
| USDT withdrawal | One `transfer(address,uint256)`; a funded policy must accept it for a 0 BNB wallet |

**A passing mainnet 0 BNB purchase has not been recorded.** Regression tests use mocked providers/RPC and a public, unfunded fixture signer. Policy funding, live route availability and Privy signing on a real account must still be verified. There is no claim of a measured under-one-minute mainnet purchase.

## Quote recovery

Binance may return only an RFQ vendor whose signing schema FirstBell does not execute, or reject an amount under its own minimum. Those cases now request a fresh direct CoW quote for the identical BSC USDT/stock contracts, wallet, side and amount. Quotes never increase the spend or change the cash token. Provider access, compliance, market-closed and invalid payload errors do not trigger this fallback. CoW can also return no liquidity, fees exceeding the amount or a timeout; an available quote is not a promised fill.

The direct path uses only `https://api.cow.fi/bnb`: `POST /api/v1/quote`, reviewed EIP-712 signing, `POST /api/v1/orders`, `GET /api/v1/orders/{uid}` and `GET /api/v2/trades?orderUid=...`. It uses the same pinned CoW contracts and MegaFuel approval flow. The order UID binds its typed-data digest, owner and expiry. Recovery checks or resubmits that same signed order; a provider acknowledgement never means Purchased. A matching trade and independent successful BSC receipt with the expected token transfers and two confirmations are required. Application data is fixed to an empty JSON object and cannot carry user-selected hooks.

Firsthand public-fixture API checks on 2026-10-07 returned quotes for 1 USDT → TSLAon and 10 USDT → NVDAon. These read-only offers used an unfunded fixture address; no user order or payment was submitted. They do not establish a universal $1 minimum, issuer eligibility, policy funding or a completed purchase.

## Activate the private policy

1. Follow [NodeReal Sponsor Guidelines](https://docs.nodereal.io/docs/megafuel-sponsor-guidelines). Create a **private/type 1** BSC mainnet policy owned by your NodeReal API key. Set an active time window and bounded total/daily/per-wallet spending and transaction limits. New policies have no funds; fund it through the provider's documented dashboard process and verify the credited balance there.
2. Restrict `ToAccountWhitelist` to the intended token contracts: BSC USDT `0x55d398326f99059ff775485246999027b3197955` for buys/withdrawals. Remove the former USDC entry. If you also sponsor sells, add only the supported stock-token contracts that you intend to cover. The transaction recipient for approval is the **token**, not the relayer.
3. Set `ContractMethodSigWhitelist` to `0x095ea7b3` (`approve(address,uint256)`) and, to cover withdrawals, `0xa9059cbb` (`transfer(address,uint256)`). An approve-only policy cannot sponsor withdrawals. FirstBell independently enforces spender `0xC92E8bdf79f0507f65a392b0ab4667716BFE0110`, exact amount (or reset to zero), native value zero, gas limit no greater than 200,000, signed wallet, chain, nonce and legacy gas price zero. The provider method whitelist alone does not validate the spender or amount.
4. In the production Vercel project's **Settings → Environment Variables**, set server-only `MEGAFUEL_API_KEY` and `MEGAFUEL_POLICY_UUID`. Do not use `VITE_` names. Redeploy after configuration. Keep the existing Binance, Privy and persistent account-store configuration.

No policy creation, funding transfer or deployment-secret update is performed by the app. Do not paste secrets into chat, commit them or expose them in client code. A missing policy stops a 0 BNB approval. A configured policy rejecting the transaction never falls back to charging the user. Existing wallets with BNB can still explicitly confirm a self-paid approval when sponsorship is unconfigured; the actual estimated BNB fee is displayed and Privy requests wallet confirmation.

## Implementation and security

`worker/megafuel.ts` sends private-policy requests only to `https://open-platform-ap.nodereal.io/{server-key}/megafuel/56`, with `X-MegaFuel-Policy-Uuid` and `User-Agent: FirstBell/0.1.0`.

- During quote preparation, allowance/balance checks and zero-price approval simulation overlap the provider quote. `pm_isSponsorable` and MegaFuel's pending nonce read run concurrently. No transaction is signed or relayed before Confirm.
- The eligibility check accepts MegaFuel's observed lowercase `sponsorable` response and the documented legacy `Sponsorable` response. Only an explicit boolean `true` permits sponsorship. A boolean `false` is a policy decline; missing, malformed or conflicting values remain unavailable. The same check covers trade approvals and USDT withdrawals.
- Privy's `useSignTransaction` signs an explicit legacy transaction with `gasPrice: 0`, the prepared gas limit, chain 56 and MegaFuel nonce, without broadcasting it.
- Authenticated `/api/trade/approval/submit` accepts a sealed account/wallet-bound plan and signed serialized bytes. The server parses the transaction, recovers its signer, checks all approval fields, checks the pending nonce/policy again, and relays via MegaFuel `eth_sendRawTransaction`.
- The exact signed transaction/hash is retained if dispatch is ambiguous. Recovery retries the same bytes; it does not pick a new nonce, charge BNB, create a second stock order or report a fill from an acknowledgement.
- A real successful approval receipt is required before signing the same reviewed RFQ order. Reset and exact approval use sequential receipts. An expired order or changed refresh payload requires a fresh review.
- Order submission verifies live balance and allowance, signature and expiration. Purchased requires provider fill, a successful settlement receipt, two confirmations and correct wallet token transfers. Status and write limits are separate from quote limits.
- A durable account record binds each dispatch to its request ID, typed-order hash and signature hash before the provider call. A lost order acknowledgement can recover that same dispatch after fill/expiry without mistaking the spent balance for a new order. A recorded order ID is returned without another submission; fill still requires settlement verification. Pending signed attempts also survive a page reload under their original wallet.
- Read-only `GET /api/trade/capabilities` reports configuration presence and supported cash tokens without secrets or provider calls. `sponsorshipConfigured: true` does not establish policy funding/eligibility or a passing live acceptance test.

## Funded acceptance procedure

Use direct **Trade**, not the legacy Agent. For each case retain the actual transaction hashes, initial balances and measured elapsed time without credentials.

1. Sign in to create a brand-new embedded wallet. Verify BSC native balance is **exactly 0 wei**, spending-token balance is sufficient, stock balance is zero, and allowance to the CoW relayer is zero. Fund only BSC USDT.
2. Choose a stock with a currently available, validated CoW RFQ quote. Review the amount/minimum/fee/expiry and confirm once. Require a real MegaFuel approval receipt with zero user gas price, a verified filled order, and the stock in Portfolio. Verify the wallet remains at 0 BNB.
3. Test insufficient USDT; policy rejection; expiry before/while approving; failed approval; failed purchase; transaction timeout/unknown dispatch; and sufficient existing allowance. Failures must remain failures/pending states. Do not replace a timed-out signed transaction with a new order.
4. Test a nonzero insufficient allowance if the policy permits both reset and exact approval. Measure quote, approval and settlement durations separately; provider market hours/minimums/liquidity and sponsor balance can prevent execution.


## USDT withdrawals

Portfolio → Withdraw uses available USDT; it does not automatically liquidate stock positions. The amount uses 18-decimal integer units, and Review displays the complete destination, fixed BEP20 network and estimated fee. Confirm is the only signing trigger. Both server and client bind the action to the same owned Privy embedded wallet.

- `/api/withdrawals/prepare` authenticates the user, verifies linked-wallet ownership, validates the receiving address/amount, estimates the exact USDT transfer and checks its balance. With configured sponsorship, `pm_isSponsorable` and MegaFuel pending nonce run concurrently. An eligible review says Network fee: Sponsored. A configured rejection never falls back to BNB. Without sponsorship, a funded BNB wallet may explicitly review the estimated BNB fee; 0 BNB stops before signing.
- Confirm signs a fixed chain-56 legacy transaction. `/api/withdrawals/submit` checks its signer, token, calldata, recipient, exact amount, zero native value, nonce, gas limit and gas price against a sealed, account-bound plan. No client-supplied RPC, arbitrary transaction or unrelated transfer is accepted. Withdrawals require the existing server-only `PRIVY_APP_SECRET`, account-store and authentication configuration; no new secret is exposed to the browser.
- Before dispatch, the durable account store binds the ID, plan hash, signed transaction hash and wallet nonce. Another signature/plan cannot overwrite it. A missing acknowledgement retains the same signed bytes/hash on the original wallet. Check only reads status; Retry same withdrawal resubmits those exact bytes. Recovery tickets/records last 24 hours; after that, inspect the wallet's BscScan transaction before attempting another transfer. Clearing browser storage removes the local recovery pointer.
- Processing/timeout/RPC acknowledgement cannot mean Withdrawn. Success requires a matching USDT Transfer event, correct sender/recipient/amount and two block confirmations. Reverted receipts remain failed; unexpected receipts remain unverified. Verified completion refreshes Portfolio cash and shows the most recent withdrawal in this session's Activity until a new withdrawal is reviewed. Historical wallet-wide withdrawals are not imported.
- Keep the private policy's gas budget and per-wallet/day/transaction caps bounded. `BEP20ReceiverWhitelist`, if populated, must allow the intended destination for transfers. Do not replace it with a blanket public sponsor. Contract method whitelists do not validate amounts or recipients; FirstBell independently does so.

**Live acceptance remains unverified:** no funded policy or real authenticated withdrawal wallet was available during implementation. The regression fixture covers 0 BNB, insufficient USDT, rejection/unavailability, changed nonce/expiry, failed or incorrect receipt, slow/unavailable confirmation, lost acknowledgement, exact-byte recovery, native-fee review and auth/ownership/storage failures. To complete mainnet acceptance, fund an active private policy, allow the USDT transfer method, deposit USDT into a new 0-wei-BNB wallet, confirm a small withdrawal to a verified BSC address, record its actual hash/fee and compare both balances.

## Official references reviewed 2026-10-06

- [BNB paymaster overview](https://docs.bnbchain.org/bnb-smart-chain/developers/paymaster/overview/)
- [BNB wallet integration](https://docs.bnbchain.org/bnb-smart-chain/developers/paymaster/wallet-integration/)
- [BNB paymaster API](https://docs.bnbchain.org/bnb-smart-chain/developers/paymaster/paymaster-api/)
- [MegaFuel overview](https://docs.nodereal.io/docs/megafuel-overview), [wallet integration](https://docs.nodereal.io/docs/wallet-integration-copy), [policy management](https://docs.nodereal.io/docs/megafuel-policy-management), [private policy](https://docs.nodereal.io/docs/private-policy)
- [MegaFuel `pm_isSponsorable`](https://docs.nodereal.io/reference/pm-issponsorable), [`eth_getTransactionCount`](https://docs.nodereal.io/reference/eth-gettransactioncount-megafuel), [`eth_sendRawTransaction`](https://docs.nodereal.io/reference/eth-sendrawtransaction-megafuel)
- [Official MegaFuel JavaScript example](https://github.com/node-real/megafuel-client-example/blob/main/wallet-user/js-example/index.js)
- [Privy sign without broadcasting](https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-transaction)
- [Binance Trading API integration / RFQ flow](https://web3.binance.com/en/dev-docs/products/trading-api/integration-flow), [CoW integration](https://docs.cow.fi/cow-protocol/integrate/api)

Some overview/integration pages contain older method-name spellings and form-based onboarding instructions. The implementation uses the API specification's `pm_isSponsorable`, the private-policy chain-56 endpoint, and the current Sponsor Guidelines for provisioning. A stablecoin transfer campaign does not establish approval eligibility.
