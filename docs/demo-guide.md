# Record the FirstBell demo

Aim for **3 minutes 45 seconds**, leaving room below the hackathon's four-minute video limit. Record the product in a desktop browser at 1080p, with readable text, your voice and simple captions. A working product demonstration is more useful than slides. Use the [live app](https://firstbell-server-test.vercel.app/app/) and keep the [submission checklist](submission-checklist.md) beside you.

## Prepare before recording

- Open the landing page, app, real BscScan receipt, GitHub README and Developer Experience field log in separate tabs. Close unrelated tabs and disable notifications.
- Use your own demo account. Complete sign-in privately; exclude email codes, pairing QR codes, account tokens, card/bank details, KYC documents and secret environment settings from the recording.
- Check a currently available spot route at an amount you choose. Do not assume every token supports a $1 trade. Rehearse before the final take; quote expiry, liquidity and provider eligibility can change.
- For a mainnet trade, use real BSC USDT in the exact signed-in wallet. Test card payments do not supply it. If showing the no-extra-BNB experience, verify the wallet starts at exactly 0 BNB and the funded MegaFuel policy accepts the necessary approval. A configured-policy flag alone is insufficient.
- Capture the genuine settlement hash, Filled state and actual token amount. Preserve the purchase confirmation sequence without cutting out an error or substituting another wallet's receipt. Label shortened confirmation waits and do not claim the edited video proves one-minute execution.
- If card funding is sandbox, use the normal tracked Onramper funding route and show its test context. Keep it separate from the pre-funded real stock purchase. The `demo=onramper` widget preview does not prove payment, wallet delivery or Activity tracking.
- Recheck the public Wallet Skills research before filming. If audit availability is missing, show the truthful unavailable state; do not narrate the asset as audited or an Agent order as executable.

## Shot list and narration

| Time | Show | Suggested narration |
| --- | --- | --- |
| 0:00–0:20 | Landing headline and funding/gas/withdrawal benefits | “FirstBell helps people new to crypto buy their first tokenized stock on BNB Smart Chain. We start with familiar login and local-currency funding.” |
| 0:20–0:40 | Google/email entry, then the signed-in portfolio | “The account has an embedded wallet, so the user does not need to manage a seed phrase.” |
| 0:40–1:00 | Deposit → Add Money, Onramper's currency and payment choices | “Users can fund in supported local currencies by card or bank transfer. Coverage depends on the provider and country.” Add the sandbox disclosure below when applicable. |
| 1:00–1:25 | Stock catalog, issuer/contract and Binance RWA panel | “These are Ondo tokens on chain 56. FirstBell shows Binance market data and the token price alongside its underlying reference and market session.” |
| 1:25–2:15 | Direct Trade review, wallet confirmation, genuine Filled result and BscScan | “I review the USDT spend, estimated receive, minimum and fee before confirming. The app verifies the settlement before marking it Filled.” Mention sponsored gas only if this exact transaction proves it. |
| 2:15–2:40 | Portfolio position, gain/loss, Activity and history | “The portfolio follows current value and purchase-based gains or losses. Activity brings deposits, withdrawals and trades together; failed orders stay in history.” |
| 2:40–3:00 | Withdraw review with USDT, BSC destination and fee | “Users withdraw available USDT to a BSC wallet. Stock positions must be sold first. Every withdrawal has its own review and confirmation.” Review alone is not a completed withdrawal. |
| 3:00–3:25 | Agent: `Research Apple`, multiplier/reference and audit/status fields | “Wallet Skills resolve the exact token, compare its price per share and check availability. Missing checks stay unavailable.” For the special prize, show personally verified Agentic Wallet footage as described below. |
| 3:25–3:45 | GitHub integration table, Developer Experience report and final URL | “The repository explains the integrations, verification boundaries and errors encountered. FirstBell's goal is a familiar path from everyday money to on-chain stocks.” |

## Disclosures when applicable

For a mixed sandbox/mainnet recording:

> “This card checkout is Onramper sandbox. The real BSC wallet was funded separately for the stock purchase.”

For a previously confirmed trade:

> “This is the actual receipt from my earlier purchase. I am now showing its verified position and history.”

For withdrawal review without dispatch:

> “This is the withdrawal review; I have not sent it.”

Never label a sandbox checkout as a real deposit, a quote as a purchase, a configured sponsor as a funded sponsor, or a stock-market percentage as the user's purchase-based return.

## Agentic Wallet special-prize evidence

The Agent tab alone does not establish Binance Agentic Wallet execution. The [personal connector](binance-wallet-skills.md) uses a separate Binance wallet. Only show a trade from it after you have personally connected/funded that wallet, confirmed its loopback review and verified the real receipt.

If you have that evidence, replace part of the stock-research segment with the actual MCP tool call, personal confirmation and order-status result. Keep the edited main video under four minutes; link optional additional evidence from your submission only if the form permits it. Do not blur the distinction between the Privy and Binance wallets. BNB Agent Studio is not integrated and should not be claimed.

## Record, export and share

1. Record one clear take using a screen recorder you already have. On Windows, [Xbox Game Bar](https://support.microsoft.com/en-gb/accessibility/windows/use-a-screen-reader-to-record-your-screen-with-xbox-game-bar)'s **Win+Alt+R** can capture the browser; enable your microphone. Do a short trial and play it back first.
2. Speak slowly and keep the cursor still while explaining values. Your face is optional. Use your own voice where possible; captions help judges follow the flow.
3. Trim dead time in your editor, preserving the sequence and labelling shortened waits. Export **MP4, 1080p, 30fps**. Keep the final duration at or below four minutes.
4. Upload to a publicly accessible or unlisted video page. Open the shared link while signed out to check that judges can play it without requesting access.
5. Put the actual video URL in your submission and README once available. Keep the repo, video and deployed app accessible through judging. Do not insert a placeholder link that appears finished.

Source: [official hackathon brief](https://www.bnbchain.org/en/hackathons/tokenized-stocks?tab=tracks). Video is strongly recommended, optional, and limited to four minutes; live BSC proof and the firsthand Developer Experience report remain separate submission needs.
