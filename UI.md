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
- Product contract: the App link opens `/app`. Home provides a searchable, saveable index and asset files; Trade has a Spectrum UI market chart empty state, asset selector, and Buy/Sell sheet with no payment method. It accepts no order while a verified quote and execution integration are absent. Agent uses Spectrum's AI Chat Card structure, with a source-backed conversation and no unsupported attachment action. Portfolio uses Privy Google/email login and an embedded wallet when its App ID is configured, and reads BNB plus five listed token quantities on chain. No invented balances, prices, USD valuations, or execution claims.

## App direction

- Reference: Daybreak's catalog hierarchy and mobile navigation supplied by the user. FirstBell uses its own black/white editorial system, original mark and source-backed Ondo assets.
- Home: plain true-white default canvas, large monochrome feature, compact rounded asset rows with transparent company marks. Inter is the display/body face and IBM Plex Mono identifies contracts, labels, and chain records.
- Desktop: compact top navigation. Mobile: four-item persistent bottom navigation, exactly Home, Trade, Agent, Portfolio in English; responsive Chinese labels.
- Motion: brief card entrances and a floating feature mark; reduced-motion users get static presentation. Sharp borders carry structure; no fabricated chart or price.
- Trade: compact asset and unavailable quote header, 15m / 1h / 4h / 1D timeframe pills, verified-feed chart empty state, and a bottom Market/quantity ticket. Missing prices and balances use explicit status text. The balance slider stays unavailable until a wallet balance is connected. Equal Buy and Sell pills are green and red and open the existing disclosure sheet; execution remains disabled.
- Agent: one centered 16px rounded chat sheet and one 16px rounded composer. The composer cycles source-specific sample questions, while answers require a named asset and a question within the fixed record scope. Inter and IBM Plex Mono remain the type system.
- Portfolio: the signed-out state uses a raised three-mark orbit card and a Log In button. With a configured Privy App ID, the button starts Google or email sign-in, creates an EVM wallet when needed, and reuses that account's wallet on return. The account view shows on-chain BNB balance and holdings for the listed Ondo contracts, with loading and RPC error states. A link-method action lets users add the other login method to the same account. Saved assets stay browser-local; Activity and transfers stay unavailable until their services exist. Rows and inputs use 16px corners; actions use pills; light surfaces remain pure white.

The mark provenance is in `brand-mark-sources.json`. The floating icon component lives at `components/ui/floating-icons-hero-section.tsx`. React Bits adaptations live at `components/ui/logo-loop.tsx` and `components/ui/scroll-float.tsx`, with a license notice in `third_party/REACT_BITS_LICENSE.md`.
