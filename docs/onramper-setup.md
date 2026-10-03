# Onramper card funding

FirstBell's Add Money button now opens Onramper in the same tab. The server supplies the authenticated user's embedded wallet, locks the output asset to USDT on BNB Smart Chain, and selects card payment by default. Onramper collects the amount, currency, card details, KYC and fees, and recommends the provider. Live checkout does not impose a country, fiat currency or single provider. Coverage and card acceptance still depend on the available provider, issuer and required verification.

## Activate the integration

1. Complete [Onramper partner onboarding](https://docs.onramper.com/docs/get-set-up-keys-onboarding) and obtain the environment's API key. Register `firstbell-server-test.vercel.app` as your application domain. Sandbox uses `pk_test_…`; production uses `pk_prod_…`.
2. Generate an Ed25519 pair on your own computer: `node scripts/onramper-keys.mjs sandbox` (or `live`). The helper saves separate environment keys outside the repository with private file permissions, prints only the public key, and refuses to overwrite an existing private key. Send the public SPKI PEM to your Onramper account manager and request V2 signing for its matching API key. Never send the private PKCS8 PEM.
3. Ask Onramper to confirm the **Onramper ID** for USDT on **BNB Smart Chain, chain 56**, contract `0x55d398326f99059ff775485246999027b3197955`, 18 decimals. Use the [asset coverage page](https://docs.onramper.com/docs/crypto-asset-support) or the account's authenticated [supported-currencies API](https://docs.onramper.com/reference/get_supported). Do not copy MoonPay's `usdt_bsc` code or choose Ethereum USDT based on its ticker. The account-specific Onramper ID was not verified during implementation, so there is no guessed default.
4. Register `https://firstbell-server-test.vercel.app/api/onramper/webhook` with the same API key through your Onramper account manager. Obtain the supplied HMAC webhook secret. Although Onramper makes webhooks optional for its standalone widget, FirstBell requires them for durable, correlated Activity updates.
5. Add these variables to the existing Vercel project's Production environment (or the Cloudflare Worker's runtime secrets) and redeploy:

   | Name | Value |
   | --- | --- |
   | `ONRAMPER_API_KEY` | The matching `pk_test_…` or `pk_prod_…` key |
   | `ONRAMPER_SIGNING_PRIVATE_KEY` | Entire private PKCS8 PEM; real newlines or literal `\n` are accepted |
   | `ONRAMPER_WEBHOOK_SECRET` | The secret supplied during webhook registration |
   | `ONRAMPER_BSC_USDT_ID` | Exact lowercase BSC USDT ID confirmed in step 3 |
   | `ONRAMPER_ENVIRONMENT` | `sandbox` or `live` to match the API key |

   Leave `CARD_FUNDING_PROVIDER` unset so new checkout uses Onramper. Existing MoonPay credentials are used only to check historical MoonPay sessions. Never prefix a private key or webhook secret with `VITE_`, paste them into chat, or commit them. Only the publishable API key appears in the hosted checkout link.
6. Keep the frontend and server Privy App IDs aligned. Enable **Return user data in an identity token** in Privy → User management → Authentication → Advanced, then sign out and in. Alternatively supply a working matching `PRIVY_APP_SECRET` to the server. The last observed production lookup was HTTP 401 from Privy; changing card providers does not repair those rejected wallet-verification credentials.
7. Open Portfolio → Deposit → Add Money. Onramper owns the payment screen. Return to FirstBell to check Activity. Some providers do not support automatic success/failure redirects; users can return to the app themselves without losing their recorded session.

## Sandbox and live validation

Sandbox opens `https://buy.onramper.dev/`, restricts providers to Banxa and currencies to EUR/GBP following [Onramper's testing guidance](https://docs.onramper.com/docs/testing-overview), and remains a simulated transaction. It does not settle on a testnet or credit mainnet USDT. A successful authenticated callback is labelled Checkout completed with no explorer receipt or received balance. If this asset is unavailable in the sandbox account, ask Onramper for its test configuration; FirstBell does not silently substitute another token or chain. Never enter a real card into a sandbox.

Live checkout opens `https://buy.onramper.com/` with automatic provider routing. After onboarding, complete one small payment yourself and compare the real BSC receipt, wallet balance and Activity status before claiming end-to-end success. This integration has passed local fixtures but has not completed a real Onramper checkout or payment.

## Security and operational behavior

- Checkout requires a valid app-specific Privy access token, proof of the exact embedded wallet, same-origin HTTPS request and an account rate limit. A fresh signed V2 link expires after 15 minutes. Resuming retains the session/context but creates a new single-use nonce.
- All sensitive widget fields are Ed25519-signed using [Onramper's V2 canonical format](https://docs.onramper.com/docs/widget-sign-a-url-v2). Mobile sessions are not bound to a rotating IP. The user and session routing context is AES-GCM encrypted; raw Privy IDs are not sent in the provider URL.
- [Webhooks](https://docs.onramper.com/docs/optional-set-up-webhooks) verify HMAC-SHA256 over the exact bounded raw request bytes before decrypting context or accessing account storage. Updates must match the API key, session, target asset, order, fiat amount/currency and any supplied recipient. Replayed and older statuses cannot erase a completed deposit. Swapped alternate-route assets are rejected.
- Provider completion and success redirects do not credit money. Live Activity reaches Deposit confirmed only after a successful receipt on chain 56 has a USDT Transfer from the exact contract to the embedded wallet, sufficient amount and three block confirmations. Optional missing provider hashes leave Activity confirming until a valid receipt can be checked. Wallet balance is independently read from BSC.
- Existing MoonPay history remains readable and checked through its own legacy provider. It cannot be resumed as Onramper. Test completions remain separate. Locally expired sessions still accept authenticated late payment updates.
- Keep credentials and webhook context secrets stable while payments are pending; coordinate key rotation with Onramper after draining those sessions. Use a separate key pair for each environment. This webhook-driven implementation does not require transaction API polling or fixed Vercel outbound IPs.

`GET /api/health` exposes only provider and nonempty-configuration booleans, never secret values. Authenticated `GET /api/deposits/config` additionally validates the key environment and Ed25519 PEM. Presence/readiness alone does not prove Onramper has registered the public key, enabled the exact asset or accepted a real card.
