# FirstBell

FirstBell is a landing page and research app for exploring tokenized equities on BNB Smart Chain. It presents issuer, network, token symbol, contract address, and public source links for five example Ondo Global Markets assets. Live trading is not available yet.

## Run locally

```bash
npm install
npm run dev
```

Build with `npm run build`.

## Login and wallets

FirstBell uses Privy for Google and email one-time-code sign-in. The Privy modal creates an embedded EVM wallet for a new account; a returning account loads its existing wallet. Portfolio reads the authenticated wallet's native BNB and five listed token balances from the BNB Smart Chain public RPC using viem. It displays quantities, not an invented USD valuation. The saved list is still local to the browser. Deposit, Withdraw, and trade execution remain disabled.

1. Create a FirstBell app in the [Privy Dashboard](https://dashboard.privy.io/), enable **Email** and **Google** login, and allow your deployment origin (and localhost for development).
2. Copy its public App ID into a local `.env` as `VITE_PRIVY_APP_ID=...` before `npm run dev` or `npm run build`. Do not put a Privy App Secret in a Vite variable or in this repository.
3. Redeploy with the App ID supplied at build time. Without it, the Portfolio login button stays disabled and says setup is pending. A static deployment does not consume Sites runtime environment variables during its build.
4. Sign in, check the wallet address against BscScan, log out, then sign in again with the **same linked identity** to verify the address is unchanged. To use Google and email interchangeably for one wallet, link the other method from the authenticated Portfolio screen before logging out.

This is a hosted authentication and wallet backend from Privy plus public chain reads. There is no FirstBell server API or account database yet; protected account APIs should validate Privy access tokens on the server when they are added. User-specific bookmarks, transfers, transaction history, market prices, and USD valuation are separate integrations.

## Interface

- The hero adapts the user-supplied floating-icons component in `components/ui/floating-icons-hero-section.tsx` and uses transparent company SVG marks listed in `brand-mark-sources.json`. The asset symbols and contract data are from the [Ondo token list](https://github.com/ondoprotocol/ondo-global-markets-token-list/blob/main/tokenlist.json).
- The [React Bits Logo Loop](https://reactbits.dev/animations/logo-loop) and [Scroll Float](https://reactbits.dev/text-animations/scroll-float) adaptations live in `components/ui/`. Scroll Float uses GSAP ScrollTrigger for the section headings and footer statement, and shows plain text when reduced motion is requested. Their license notice is in `third_party/REACT_BITS_LICENSE.md`.
- `src/demo.tsx` contains the landing. `/app/` is a separate route with Home, Trade, Agent, and Portfolio in `src/app.tsx`.
- Home has a searchable catalog and source-linked asset files. Bookmarks persist in the current browser. Trade provides an asset selector, the [Spectrum UI Market Chart](https://ui.spectrumhq.in/blocks/charts#market) in its no-data state, contract details, and an interactive Buy/Sell sheet. Live token price candles, quotes, and execution require integrations and are not represented as available. Agent uses an adapted [Spectrum UI AI Chat Card](https://ui.spectrumhq.in/docs/ai-chat-card) and answers fixed issuer, contract, and network questions from the token list when a company or token symbol is mentioned. Portfolio uses Privy sign-in when configured and reads BNB and listed token quantities on chain. Deposit and Withdraw are disabled; Saved assets remain local to this browser.
- Spectrum chart source is in `components/spectrumui/charts/` and the adapted chat card and typewriter are in `components/spectrumui/`; their Apache 2.0 license is in `third_party/SPECTRUM_UI_LICENSE.txt`. The app supplies an empty dataset until a verified token-specific OHLC feed is connected. The chart's demo-generated prices are never shown as token prices. The Agent is a deterministic source guide, not a live AI model.
- `src/styles.css` defines a sharp monochrome system. Light mode uses white surfaces. Inter and IBM Plex Mono are self-hosted through Fontsource packages.
- `AGENTS.md` contains the project design workflow and `UI.md` records the FirstBell-specific visual contract.

The `App` navigation item opens `/app/`. The company marks are visual navigation cues, while issuer and contract details are derived from `asset-sources.json`; the external contract links open BscScan. No price, entitlement, or availability is inferred from the ticker alone.
