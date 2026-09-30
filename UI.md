# FirstBell visual contract

Read `AGENTS.md` before making interface changes. Review matching components from the catalog below and adapt a licensed source when it fits.

| Source | URL | FirstBell use |
| --- | --- | --- |
| 21st.dev | https://21st.dev | Floating token hero pattern supplied by the user |
| React Bits | https://reactbits.dev/animations/logo-loop and https://reactbits.dev/text-animations/scroll-float | Token asset loop and scroll-linked headings |
| shadcn/ui | https://ui.shadcn.com | Shared primitives |
| Spectrum UI | https://ui.spectrumhq.in | Type and layout reference |
| Coss UI | https://coss.com/ui | Interface reference |
| shadcnblocks | https://shadcnblocks.com | Section reference |
| Rare UI | https://rareui.com | Interaction reference |
| BeUI | https://beui.dev | Motion reference |
| transitions.dev | https://transitions.dev | Shared timing and easing for tabs, menus, panels, screen swaps, and icon swaps |
| Evil Charts | https://evilcharts.com | Chart reference when data needs one |
| 8bitcn | https://8bitcn.com | Retro reference only if requested |

## Design Read

- Artifact: responsive landing and separate `/app` research workspace.
- Audience: newcomers exploring tokenized equities.
- Mode: preserve the product name and real token assets; overhaul the marketing composition.
- Visual variance: 5/10; motion: 2/10; density: 5/10; asset dependence: 7/10; brand fidelity: 8/10.

## Design decisions

- Material: digital ink and white paper. Composition: editorial marketing sections and a compact mobile app. Structure: a Swiss grid with 16px app cards and input frames, plus fully rounded primary actions. Feeling: precise, candid, confident.
- Palette: near-black `#080808`, true white `#fff`, gray rules and type. Light surfaces are white, without cream or milk tones. Transparent company marks keep their authentic color inside raised, softly rounded hero tiles. The issuer token assets remain separate from the company marks.
- Typography: Inter variable for display/body, IBM Plex Mono for labels and technical identifiers. Chinese uses the platform CJK sans fallback.
- Spacing: generous marketing section padding, tight technical rows, compact app navigation. App cards, inputs, and chart frame use 16px corners; actions use pills. Borders carry section separation.
- Motion: floating hero tiles, a restrained logo loop, and React Bits Scroll Float on editorial headings and the footer statement. App state changes use transitions.dev's 150/250/400 ms timing, cubic-bezier(.22,1,.36,1), and short 8 px/3 px screen reveals. Active pills slide, menus grow from their triggers, and sheets reveal with a short travel. Respect reduced motion. No scroll prompts, ornamental parallax, or forced smooth scrolling.
- Product contract: the App link opens `/app`. Home provides a searchable, saveable index and asset files; Trade renders token-specific Ondo market candles when configured or a labeled verified GeckoTerminal BSC pool. A separate Binance Web3 RWA readout shows its token price, per-share conversion and underlying market session only when its signed Worker call verifies the exact BSC Ondo contract. An authenticated Ondo soft quote is an estimate only and cannot submit an order. Portfolio offers card funding through a configured MoonPay checkout, with verified wallet ownership and explicit setup/unavailable states. Agent uses Spectrum's AI Chat Card structure with source-backed answers. Portfolio uses Privy Google/email login and an embedded wallet and reads USDT, BNB and five listed token quantities on chain. No invented balances, prices, USD valuations, or execution claims.

## App direction

- Reference: Daybreak's catalog hierarchy and mobile navigation supplied by the user. FirstBell uses its own black/white editorial system, original mark and source-backed Ondo assets.
- Home: plain true-white default canvas, large monochrome feature, compact rounded asset rows with transparent company marks. Inter is the display/body face and IBM Plex Mono identifies contracts, labels, and chain records.
- Desktop: compact top navigation. Mobile: four-item persistent bottom navigation, exactly Home, Trade, Agent, Portfolio in English; responsive Chinese labels.
- Motion: brief card entrances and a floating feature mark; reduced-motion users get static presentation. Sharp borders carry structure; no fabricated chart or price.
- Trade: compact asset and token-market price header, 15m / 1h / 4h / 1D timeframe pills, real OHLC when a verified source responds, and a bottom Market/quantity ticket. Provider and data timestamps remain visible. A compact 16px Binance RWA card keeps its price and reference separate from the chart source and the executable price; the underlying market's open state is not a claim that the token can trade. Missing prices and balances use explicit status text. The balance slider stays unavailable until a wallet balance is connected. Equal Buy and Sell pills are green and red and open the quote estimate sheet; execution remains disabled until eligibility, a binding quote and wallet transaction integration are available.
- Agent: one centered 16px rounded chat sheet and one 16px rounded composer. The composer cycles source-specific sample questions, while answers require a named asset and a question within the fixed record scope. Inter and IBM Plex Mono remain the type system.
- Portfolio: the signed-out state uses a raised three-mark orbit card and a Log In button. With a configured Privy App ID, the button starts Google or email sign-in, creates an EVM wallet when needed, and reuses that account's wallet on return. The account view shows live USDT, a separate BNB network-fee balance and listed Ondo holdings, with loading and RPC error states. The card deposit dialog shows an amount, the fixed receiving token/network/wallet and a clear handoff to MoonPay's final fees and verification. Pending, action-needed, confirming, completed, failed, expired, test and unavailable states are distinct. Only verified receipt confirmation uses success copy. Activity shows this account's card deposit history; general wallet history and withdrawals remain unavailable. A link-method action lets users add the other login method to the same account. Saved assets sync when the account API is configured. Rows and inputs use 16px corners; actions use pills; light surfaces remain pure white.

## Card funding extension (2026-09-30)

- Design Read: existing Portfolio utility flow; newcomer audience; extension; digital ink/white paper; variance 2/10, motion 2/10, density 5/10, asset dependence 1/10, brand fidelity 9/10.
- Preserve Inter Variable / IBM Plex Mono, semantic gray rules, 16px input/row corners, pill actions, 44px targets and the current light/dark tokens. No landing redesign or stock-flow copy change.
- Reference: reviewed [shadcn/ui Dialog](https://ui.shadcn.com/docs/components/dialog) for titled/described modal structure and close behavior. Use native `<dialog>` for the focus trap, inert background and Escape behavior without another component library.
- Composition: title → amount → receiving details → fee/timing disclosure → provider action. On return, title → verified status → requested/received amounts → check or transfer link. Keep provider implementation details out of the normal purchase flow.
- Motion: a 250ms, 8px dialog reveal and a pending-state spinner. Reduced motion removes both. Forms, errors, checking, success, terminal history and unconfigured checkout have real states.

The mark provenance is in `brand-mark-sources.json`. The floating icon component lives at `components/ui/floating-icons-hero-section.tsx`. React Bits adaptations live at `components/ui/logo-loop.tsx` and `components/ui/scroll-float.tsx`, with a license notice in `third_party/REACT_BITS_LICENSE.md`.

## Sandbox checkout extension (2026-09-30)

- Preserve the existing deposit dialog, Inter/IBM Plex Mono, gray rules, 16px surfaces, pill actions, light/dark tokens, native dialog focus behavior and reduced-motion settings. Design Read: extension; variance 2/10, motion 2/10, density 5/10, brand fidelity 9/10. Reviewed the existing components and shadcn/ui Dialog guidance; no new library or layout overhaul.
- Sandbox's Portfolio action is **Test card checkout**. The dialog shows **ETH / Ethereum Sepolia**, a persistent test-mode notice, the documented test card/billing instructions and the provider's 1/100 testnet-delivery caveat. It never calls Sepolia ETH BSC USDT.
- Session details and explorers use the recorded asset, independent of the current checkout configuration. Sandbox completion is **Test completed**, with no credited USDT. Portfolio continues to display only actual BSC mainnet balances. Pending sessions from a different mode have a clear configuration-change state and cannot be resumed under a different asset.
- Mainnet stock execution remains unavailable; sandbox success must not imply a real stock purchase.
