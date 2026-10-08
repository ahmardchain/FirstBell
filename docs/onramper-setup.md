# Onramper funding setup

Portfolio → Deposit → Add Money opens Onramper in the same tab. FirstBell fixes the authenticated embedded wallet and **USDT on BNB Smart Chain**. Onramper owns amount, local currency, card/bank method, provider fees and verification. The normal flow imposes no single fiat or payment method; actual coverage depends on the user's country, provider and account.

## Configure the existing Vercel project

Register `firstbell-server-test.vercel.app` with Onramper. Use matching sandbox or live credentials. Confirm the account-enabled USDT BSC ID, rather than choosing USDT by ticker: chain **56**, contract `0x55d398326f99059ff775485246999027b3197955`, **18 on-chain decimals**. This sandbox account has previously returned `usdt_bsc`; recheck when changing account or environment.

| Server variable | Purpose |
| --- | --- |
| `ONRAMPER_API_KEY` | Matching `pk_test_…` or `pk_prod_…` publishable key |
| `ONRAMPER_ENVIRONMENT` | `sandbox` or `live`; a test-key prefix can infer sandbox, but live must be explicit |
| `ONRAMPER_BSC_USDT_ID` | Exact supported BSC USDT ID |
| `ONRAMPER_WEBHOOK_SECRET` | Account-manager-issued HMAC secret for correlated status updates |
| `ONRAMPER_SIGNING_VERSION` | `v1` for permitted existing shared-secret accounts, or `v2`; unset selects V2 |
| `ONRAMPER_SIGNING_SECRET` | V1 dashboard signing secret, server only |
| `ONRAMPER_SIGNING_PRIVATE_KEY` | V2 Ed25519 PKCS8 private PEM, server only |

Only the signing credential for the selected version is required. Never put a signing secret/private key or webhook secret in `VITE_` variables, chat or Git. Redeploy after configuring the host. Leave `CARD_FUNDING_PROVIDER` unset for new Onramper sessions. The retained MoonPay code validates historical records; it is not the current onboarding recommendation.

### V1 and V2 are distinct

Existing-partner **V1 compatibility** signs the exact asset/wallet pair with the shared dashboard secret using HMAC-SHA256. Select `ONRAMPER_SIGNING_VERSION=v1` only when that account is allowed to use V1. The legacy private-key variable can accept the dashboard secret for compatibility, but `ONRAMPER_SIGNING_SECRET` is the clearer setting. No Ed25519 public-key registration is used for V1.

**V2** uses an Ed25519 pair. Generate it privately with `node scripts/onramper-keys.mjs sandbox` or `live`; send only the SPKI public PEM to Onramper and have it registered against the matching API key. FirstBell signs the core fields, redirects and encrypted session context. Its builder also emits timestamp, nonce and 15-minute expiry parameters; provider-side replay/expiry enforcement has not been validated. V2 is Onramper's required direction for new integrations. An unregistered key is not activated by adding a private key to Vercel. V2 never falls back silently to V1.

Register the return domain and callback URLs your account requires. FirstBell returns to `/app/?tab=portfolio&deposit=<session-id>` on the fixed origin for both success and failure. Register `https://firstbell-server-test.vercel.app/api/onramper/webhook` and its matching secret for durable session updates. Public docs and account-manager confirmation determine account-side activation; code configuration alone cannot establish it.

## Wallet verification

Keep frontend and backend Privy App IDs matched. Checkout requires a valid access token and ownership of the exact embedded wallet. Enable Privy's identity tokens or supply a valid matching server `PRIVY_APP_SECRET` for authenticated ownership lookup. The [deployment guide](vercel-deployment.md) covers the private account store. A sign-in/ownership failure occurs before Onramper and should be diagnosed separately.

## Sandbox versus live

Sandbox opens `https://buy.onramper.dev/`. The normal signed flow allows the documented test providers `banxa,sardine,topper,stripe,transfi,btcdirect,coinify,onrampmoney` and leaves supported currency/method selection to the widget. It does not hardcode EUR/GBP or cards. Some providers still have no route for the chosen country/asset. The separate [wallet-free UI preview](onramper-demo.md) retains its own narrow test settings; it is not funding proof.

Sandbox payments are simulated: no BSC or testnet funds are delivered and mainnet portfolio balances must not increase. Follow the provider's documented test flow; do not enter real payment credentials into a test checkout.

Live opens `https://buy.onramper.com/` and requires production onboarding. Verify a personally completed payment, the real BSC USDT receipt and wallet balance before claiming a live card-to-stock journey. A widget redirect, successful signature or sandbox completion is insufficient. Payment completion has not been established by this documentation audit.

## Settlement and failure handling

- Webhooks verify HMAC over the bounded raw body before using encrypted session context. They must match the session, key, asset, provider order and any supplied recipient. Replay/older updates cannot erase a completed record.
- A live deposit is confirmed only after an independent successful BSC receipt contains the expected USDT transfer to the owned wallet, amount and three confirmations. A success redirect never credits funds.
- Missing hashes remain confirming. Wallet balances are independently read from BSC. Historical MoonPay records retain their own checker and cannot be reopened as Onramper.
- A resumed payment session is separate from failed stock-order history. Resuming does not manufacture a deposit or resubmit a failed stock order.
- Keep credentials and context stable while payments are pending. Coordinate environment/key changes with the provider.

## Official references

- [Keys and onboarding](https://docs.onramper.com/docs/get-set-up-keys-onboarding)
- [Signing overview and migration direction](https://docs.onramper.com/docs/feature-overview)
- [V2 widget signing](https://docs.onramper.com/docs/widget-sign-a-url-v2)
- [Widget parameters](https://docs.onramper.com/docs/supported-widget-parameters)
- [Testing](https://docs.onramper.com/docs/testing-overview)
- [Supported assets](https://docs.onramper.com/reference/get_supported)
- [Webhooks](https://docs.onramper.com/docs/optional-set-up-webhooks)
