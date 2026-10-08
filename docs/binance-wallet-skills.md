# Binance Wallet Skills and Agentic Wallet in FirstBell

FirstBell uses two complementary integrations:

| Entry point | Research and checks | Wallet execution |
| --- | --- | --- |
| Website Agent | Published `binance-tokenized-securities-info` and `query-token-audit` HTTP skill contracts | Existing Privy wallet, explicitly reviewed CoW/Binance route |
| Personal MCP connector | The same HTTP skills plus Binance CLI wallet state | Official `@binance/agentic-wallet` CLI, after a personal local browser confirmation |

The website uses a deterministic command parser. The MCP connector supplies real tools to the LLM in your chosen AI client. Installing it does not create an autonomous strategy, move funds, or prove a completed trade. The Binance wallet is distinct from the Privy wallet: its balance, deposit address and order history must not be merged with Privy portfolio records.

## Website Agent

Sign in with Google or email to reveal the website Agent. Opening its direct link while signed out shows a sign-in prompt; the workspace and history are not mounted until authentication is ready. Try `Research Apple`, `Is NVDAon safe?`, `Is AAPLon tradable?`, `Compare Apple with its reference price`, or `Buy Nvidia with 10 USDT`. Research is read-only and requires no funded wallet; trades retain wallet ownership verification, review, token approval where needed and explicit user signing. Spanish, French, Portuguese and Chinese commands and labels are included.

`GET /api/agent/research?symbol=AAPLon` verifies the exact catalog address against Binance's Ondo BSC list, then reads dynamic data, token market status, issuer metadata and a security audit. Public research coalesces requests, caches successful results for 15 seconds and limits concurrent upstream work; the displayed check time remains the original observation. Trade preparation and dispatch always fetch fresh checks. `GET /api/agent/skills` describes the skill versions and execution boundary. No Binance API key is needed by these public skill endpoints. Existing signed trade routes still need their existing server credentials.

Agent preparation sends `walletSkills: true` to the authenticated trade API. The server reads the official skill endpoints before preparing and seals their findings into the review ticket. It checks them again immediately before a first dispatch. Unverified contracts, missing/error responses, unavailable token trading status and level-5 risk block the trade. A matching audit response that explicitly reports `isSupported: false` is shown as **Not covered**, with no invented rating. It can reach review only for the verified catalog contract and available trading status; the user must acknowledge the absent Binance audit before any wallet confirmation. The submit API independently requires `auditAcknowledged: true` for that sealed report. Changed audit/status findings require a fresh review and record a Failed receipt without dispatch. Saved signed submissions reconcile by reads; they never restart automatically. Other Trade-screen behavior is preserved.

### Conversation and order history

**History** contains **Conversations** and **Wallet orders**. Conversations and validated research snapshots persist in this browser, scoped to the Privy user and wallet. Signing out hides the Agent and closes its workspace; saved conversations remain available after signing back in. **New Conversation** keeps earlier chats. Select a conversation to reopen it, use **Refresh research** for current data, or delete it. The bounded store retains up to 20 conversations and 60 messages per conversation. It is device-local and does not sync across devices.

Restored reports are marked as saved research. Chat history contains display data only, never executable plans, signatures or approval consent. Reloading requires a fresh trade request and review. Wallet orders use the existing wallet receipt history, including direct Trade orders, with Filled/Failed/pending states and input/output amounts; they are not numbered and failed orders have no Resume control. The personal Binance CLI wallet retains its own separate order history.

Each token's `sharesMultiplier` is read live. Per-share token price is `tokenPrice / sharesMultiplier`; premium is its ratio to the underlying share price minus one. Missing underlying prices remain unavailable. The reference price is not an executable quote. The token's availability check is separate from underlying stock-exchange hours; the Agent conservatively honors the token-status endpoint's closed/paused/restricted state.

## Personal Binance Agentic Wallet connector

Use Node.js 24+ on your own PC. From this checkout:

```sh
npm ci
npm ci --prefix agent-runtime --ignore-scripts
npm run agent:check
npm run agent:config
```

The check verifies the installed CLI and MCP libraries without signing in. The config command prints a JSON MCP configuration containing the correct absolute Node and `server.mjs` paths for this computer. Add it to a stdio-capable AI client such as Cursor or Claude Desktop, then restart the client. The client provides its own LLM; no LLM key is added to FirstBell. `npm run agent:binance` starts the same server directly for inspection. Run `npm test` after both installs to include the actual MCP transport smoke test; that test is explicitly skipped when the optional connector dependencies are absent. The official CLI has an optional native keychain dependency; this installation skips native scripts and the CLI can use its encrypted local-file fallback.

1. Ask the AI to connect Binance Agentic Wallet. `sign_in` returns Binance's exact sign-in link and pairing code. Open it, compare the code and confirm in your Binance app. An existing Binance account and MPC wallet are prerequisites.
2. Complete `verify_sign_in`. It waits for the app and checks the CLI's actual connected state; an expired QR requires a new sign-in.
3. Read `wallet_status` / `wallet_balance`. Review your BSC address, session expiry and daily quota. Set spending limits, token scope and abnormal-transaction handling in the Binance app. The connector cannot change those settings. Fund this specific Binance wallet with the intended small test amount and any required BNB yourself.
4. Request an immediate stock trade, for example one USDT of `AAPLon`. `prepare_trade` resolves the pinned token, checks audit/status/balance, obtains the real Binance market quote and returns a loopback review URL.
5. Open the URL on the same PC and personally click **Confirm trade**. When Binance explicitly does not support an audit, first tick the acknowledgement in that page; the local server also enforces it. The AI has no execute, sign, transfer, generic shell or approval tool. The review expires after two minutes. It shows exact spend/contracts, an estimated receive, 0.5% execution slippage, MEV protection, wallet and audit findings. Binance re-quotes at execution; the estimate is not a binding minimum-receive guarantee.
6. Use `order_status` with the original review ID. A submitted order stays Pending. Binance Finished stays Confirming until two BSC confirmations and matching input/output transfers prove the actual quantities. Failed stays Failed in history. A timeout is Unknown and is never automatically resubmitted; inspect Binance's own history.

Supported tools: `wallet_skills`, `research_stock`, `wallet_status`, `sign_in`, `verify_sign_in`, `sign_out`, `wallet_balance`, `prepare_trade`, `order_status`, `order_history`. Conditional orders, scheduled strategies and transfers are outside this connector's scope. Bare stock tickers resolve to FirstBell's explicitly displayed Ondo BSC catalog; other issuer representations are not silently substituted.

Credentials stay in the official CLI's device-local store. Sanitized order attempts persist under `.firstbell-binance/orders.json` in the user's home directory, with restrictive permissions and atomic writes; `FIRSTBELL_AGENT_DATA_DIR` can choose a private directory. This is a personal stdio service, not a public/shared-wallet server. Do not deploy this CLI session inside the Vercel function or share it with website visitors.

## Upstream specifications

| Skill | Version used | Upstream Git blob |
| --- | --- | --- |
| [binance-tokenized-securities-info](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-tokenized-securities-info/SKILL.md) | 1.1 | `1c960eb9eb90ddffc85e13112daa0c291c7fea1e` |
| [query-token-audit](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/query-token-audit/SKILL.md) | 1.4 | `fd45c80765df00c8dfe5155055a7d23c2f3b03c5` |
| [binance-agentic-wallet](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/SKILL.md) | 1.12.0; CLI 1.10.0 | `33c68dd84f47f5a117c7a31e062d671bee40bfb4` |

These skills are Markdown tool specifications. FirstBell implements their documented HTTP/CLI contracts; it does not treat Markdown as executable JavaScript or claim an SDK integration. The upstream specifications and npm CLI are not copied into the repository. CLI preflight checks its required version and surfaces skill-update availability; changes need deliberate review.

## Hackathon evidence

Show stock research, exact-contract resolution, a multiplier-aware comparison, an audit/status rejection, one personally confirmed small BSC mainnet trade and receipt-verified quantities. Include a failed/pending example and the spending controls. Record the actual tool calls and sanitized outcomes in your firsthand report. Fixture tests and installed tooling do not establish live provider availability or a funded trade. See the dated validation entry in `developer-experience-report.md` for what was actually exercised.
