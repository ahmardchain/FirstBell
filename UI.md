# FirstBell visual contract

- Plain-language trading extension (2026-10-04 UTC): Agent now uses the existing Spectrum chat sheet to prepare wallet-bound trades. This supersedes the fixed-record-only Agent scope below. Design Read: newcomer trading utility; extension; digital ink/white paper; variance 2/10, motion 2/10, density 5/10, asset dependence 3/10, brand fidelity 9/10. Preserve Inter/IBM Plex Mono, existing light/dark tokens, 16px surfaces, pill actions, company marks, focus styles, four tabs and reduced motion. Reuse the current licensed chat component; no new library or layout overhaul.
- Show one inline trade review with spend, receive estimate, signed minimum, included fee, exact wallet, chain, route and expiry. Missing token permission and order signing are separate confirmations with visible Privy wallet prompts. Cancel, refresh, preparation, signature cancellation, approval confirmation, provider/ownership errors, unknown submission, pending settlement and confirmed/failed order states remain distinct. Only independently verified on-chain settlement uses trade-success copy. The parser is openly described as fixed commands, with no live LLM or autonomous-strategy claim. Onramper's UI-only sandbox preview and the manual Trade route checker retain their separate behavior.

- Missing wallet proof follow-up (2026-10-03 UTC): preserve the reference-matched Deposit methods and native MoonPay handoff. Replace the indefinite wallet-verification promise with explicit setup, temporary-service and timeout errors. Keep the Trade sheet's request bounded and cancel obsolete quotes. Never replace a failed provider quote with an invented receive value.

- Session/quote follow-up (2026-10-03 UTC): keep the approved direct MoonPay handoff and Trade sheet layout. Show Enter an amount before input, Check route for a quote after input, Checking route during a request, and Quote unavailable only after failure. Keep route expiry and wallet/session errors distinct; do not display invented receive quantities.

- Deposit authentication follow-up (2026-10-02 UTC): preserve the approved wallet/deposit layout. A rejected access token says the sign-in session could not be verified; only a failed linked-wallet proof uses wallet verification copy. Loading, sandbox, provider configuration and confirmed-funds states remain distinct.

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
- Product contract: the App link opens `/app`. Home provides a searchable, saveable index and asset files; Trade requests token-specific Binance Web3 candles and trading-info prices when configured, with labeled Ondo and verified GeckoTerminal fallbacks. A separate Binance Web3 RWA readout shows its token price, per-share conversion and underlying market session only when its signed Worker call verifies the exact BSC Ondo contract. Its token price can fill the main header when the chart-market price is missing, with a Binance RWA label. An authenticated Ondo soft quote is an estimate only and cannot submit an order. Portfolio offers card funding through a configured MoonPay checkout, with verified wallet ownership and explicit setup/unavailable states. Agent uses Spectrum's AI Chat Card structure with source-backed answers. Portfolio uses Privy Google/email login and an embedded wallet and reads USDT, BNB and five listed token quantities on chain. No invented balances, prices, USD valuations, or execution claims.

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

## Binance trading-route check extension (2026-09-30 UTC)

- Design Read: existing Trade utility screen; newcomer audience; extension; digital ink/white paper; variance 2/10, motion 2/10, density 5/10, brand fidelity 9/10. Reviewed the existing trade sheet and [shadcn/ui Sheet](https://ui.shadcn.com/docs/components/sheet). Preserve current tokens, 16px input corners, equal Buy/Sell actions, focus trap, Escape and reduced-motion behavior. No new layout or component library.
- The sheet's primary action is **Check trading route**. Buy input is USDT to spend; Sell input is the stock-token quantity. The dock's stock quantity remains separate from the sheet's USDT input. Show the verified receiving estimate, vendor, receiving wallet and BSC network; expose clear login, wallet preparation, setup, unavailable, loading, error and stale-quote states in English and Chinese.
- Cancel obsolete requests when the wallet, account, asset, side or amount changes. A found route is explicitly labelled **no order placed**. The new Binance check replaces the UI's Ondo soft-quote dependency; the old indicative endpoint remains available. No wallet signature, approval, order submission or trade-success state is offered by this extension.

## Binance market-feed correction (2026-09-30 UTC)

- Design Read: Trade data view; preservation fix; variance 1/10, motion 2/10, density 5/10, brand fidelity 9/10. Reviewed the existing Apache-licensed Spectrum Market Chart and its ChartState/ChartError components; reuse their loading, empty, error and retry surfaces. Preserve all layout, type, color, timeframe pills, asset records and trade actions.
- The existing chart now receives signed Binance Web3 OHLC and volume for the exact BSC token. Its provider label remains visible. A valid price and failed/empty history are independent states; the chart never manufactures candles. The header can display the separately verified RWA token price when needed and labels that source.
- Distinguish access rejection, request limits, unavailable history and provider downtime in English and Chinese. Error states offer Retry using the existing component. All requests retain abort guards. No new library, artificial tick animation or stock-exchange price substitution is used.

## Home StockCard integration (2026-10-02 UTC)

- Design Read: Home asset index for newcomers; preservation extension; digital ink and white paper; variance 2/10, motion 2/10, density 6/10, asset dependence 8/10, brand fidelity 9/10. Adapt the user-supplied StockCard layout: compact company identity, USD token price, signed 24-hour change and Buy action. Keep Inter/IBM Plex Mono, gray rules, 16px surfaces and pill buttons. Use the existing local company marks.
- Shared components remain in `components/ui`, utilities in `lib/utils.ts`, global Tailwind/theme styles in `src/styles.css`, and Home layout in `src/app.css`. TypeScript, Tailwind, Motion, Lucide, Radix Slot and class-variance-authority were already installed. Add the supplied button variants and missing theme tokens without changing existing defaults.
- Replace the old Home asset cards with StockCard rows. Preserve search, bookmarks, account-backed saved assets, asset files, light/dark themes and English/Chinese labels. On narrow cards, move price and Buy below the company and bookmark; all card action targets are at least 44px. Reduced motion removes hover scaling.
- Home requests the five exact token records concurrently through the existing market API, with a 15-second bound and cleanup when leaving Home. Missing, invalid or rejected prices stay unavailable; sample stock-exchange prices are not inserted. Buy selects the token and opens the existing Buy route-check sheet; it does not submit an order.
- `components/ui/stock-card-demo.tsx` is a standalone callback/layout example with the same local marks and unavailable prices. It is not the landing page and is not used as market data.
- Validation: production TypeScript/Vite build and all 51 existing tests pass. Verified the deployed Cloudflare `/app/` in the browser: five StockCards, zero old asset cards, five loaded local logos, no horizontal overflow at a 1348px viewport, and card action targets at least 44px. Search, saved/unsaved filters, empty results, asset-file opening, Escape dismissal, Home navigation and the AAPLon Buy sheet work. Verified light/dark themes and English/Chinese labels; restored English/light and removed the test bookmark. The live feed remains unavailable, rather than displaying sample prices. Phone container rules and reduced-motion handling were reviewed in source; this browser did not provide viewport emulation.
- Rendered review: overall 8.4/10; philosophy 9, hierarchy 8, craft 8, functionality 9, originality 8. Keep the real company marks, compact price/action hierarchy and clear missing-price state. No additional decorative UI is needed. Live pricing requires the separate provider-access issue to be resolved.

## Landing copy and Buy entry (2026-10-02 UTC)

- Design Read: newcomer landing page; copy and navigation update; preservation; variance 1/10, motion 2/10, density 5/10, brand fidelity 9/10. Use the user's exact English copy and first slogan. Preserve Inter/IBM Plex Mono, ink/white surfaces, floating company marks, horizontal four-step flow, themes and existing disclaimer.
- Keep the primary Buy action first; add a quieter, wrapping secondary link to the four steps. Hero and closing Buy links open the existing app Buy sheet. This changes navigation, not stock execution or card-funding capabilities.
- Restore the requested distinction heading in the existing overview section. Standardize Apple to AAPLon; show Amazon's familiar AMZN ticker in the marketing strip while its asset file retains the actual AMZNon token symbol and verified contract.
- Validation: production TypeScript/Vite build passes. Verified the live Cloudflare landing page shows the exact hero, app and closing headings, first slogan, updated ticker label, AAPLon/AMZN strip and unchanged disclaimer. The secondary hero link scrolls to all four existing steps. Clicked both primary CTAs; each opens `/app/?tab=trade&side=buy` with the Buy NVDAon sheet and its existing no-order notice. No purchase or login was performed. No horizontal overflow at the observed desktop width; phone wrapping rules were reviewed in source, without viewport emulation.
- Rendered review: overall 8.6/10; philosophy 9, hierarchy 9, craft 8, functionality 9, originality 8. The shorter headline stays clear among the company marks; the Buy action is first and visually stronger than the steps link. Preserve the existing composition and motion.

## Landing rounded corners (2026-10-02 UTC)

- Design Read: homepage refinement; preservation; variance 1/10, motion 2/10, density 5/10, brand fidelity 9/10. Round the landing controls and asset preview using 24px panel corners, 16px inputs/rows and pill actions, consistent with the app. Keep the user's copy, composition, themes, company marks and four-step motion.
- Scope the new radius tokens to landing elements. Round the hero, App and closing actions, language menu, search field, asset preview and profile links. Clip preview content at its outer corners; preserve keyboard focus and interaction behavior.
- Verified the deployed homepage: pill actions, 24px preview corners and 16px search/asset-row corners are applied, with no horizontal overflow at 1348px. Keyboard navigation reaches the next asset row with a visible inset focus outline. Reviewed the rendered dark-theme hero; the copy and visual hierarchy remain intact. Mobile radii inherit the same tokens; viewport emulation was unavailable.
- Rendered review: philosophy 9, hierarchy 9, craft 9, functionality 9, originality 8. The rounded actions now match the app without changing the landing composition.

## Portfolio and Deposit reference replacement (2026-10-02 UTC)

- The user's two wallet screenshots are the controlling design references for these screens. This replaces the earlier Portfolio direction above: remove its Log out, saved-asset section, link-method action, wallet/fee summary panels and explanatory account copy. Home bookmarks remain part of Home.
- Design Read: responsive wallet utility; newcomer audience; explicit reference copy; quiet dark digital surface; variance 1/10, motion 2/10, density 3/10, asset dependence 4/10, reference fidelity 9/10. Match the blue avatar, account name and pencil, balance and eye, Positions value, Deposit/Withdraw pills, Positions/Activity tabs, rounded Search, and plain empty state. Preserve the app header and four-item mobile navigation.
- Use Arial/Helvetica for these two screens to match the supplied reference. Dark Portfolio uses `#0e171a`, light type and muted blue-gray; Deposit uses `#181f22` with `#23292c` method rows. The existing light theme remains available. Actions, tabs, search and funding rows are fully rounded. Primary touch controls remain at least 44px. Portfolio is capped at 620px on wider screens.
- Deposit opens a separate view with Transfer Manually, Deposit from Exchange and Add Money. Keep a compact Back/title header so users can return. Manual/exchange choices show the actual account's EVM address, a locally generated QR code, Copy, and the BNB Smart Chain/BEP20 instructions. Add Money opens the existing authenticated card checkout dialog and its configuration, sandbox and verified completion states. Last Used follows the user's selected method on this device.
- Asset direction: extract the blue avatar raster from the supplied reference; use genuine local USDT, BNB, Coinbase, Binance, Visa and Mastercard marks. Only display supported funding assets/payment methods. The screenshot's unverified multi-chain badges, limits and timing promises are replaced with the actual network/card descriptors.
- Values remain real account data: cash is the on-chain USDT quantity formatted at a nominal US$1 per USDT. Positive token positions require validated token-market prices from the existing market API; a missing price produces Value unavailable, never a fabricated zero. The main balance, holdings value and quantities can be hidden with the eye. The display name is editable on this device. Withdraw remains disabled because transaction execution is not implemented.
- Existing Privy Google/email authentication, wallet creation, deposit API ownership checks, activity and card dialog remain connected. No new auth provider, credentials or server configuration is required. Screen swaps retain reduced-motion handling. Test fixtures are local-only and excluded from deployment.
- Validation: paired reference/render comparisons at a 390px mobile content width; desktop and light/error state review; Deposit/Back, both tabs, Search, eye, manual and exchange receive views, actual clipboard copy, and Add Money/Escape checked in the browser. Production build and 28 relevant existing tests pass. Full review and limitations are recorded in `design-qa.md`.
- Rendered review: overall 8.8/10; philosophy 9, hierarchy 9, craft 9, functionality 8, originality 9. Keep the reference composition and plain states; no additional panels or account actions are needed.


## Direct MoonPay UI (2026-10-03 UTC; replaces the card dialog above)

- The user's instruction controls this update: Add Money opens MoonPay's own hosted checkout directly. Remove the FirstBell amount/fiat selector, test-card panel, test-mode notice and asset/network/wallet summary. No replacement FirstBell payment modal. MoonPay owns the amount, currency, payment methods, verification and fees.
- Design Read: existing reference-matched funding utility; preservation extension; quiet dark surface with the existing light mode; variance 1/10, motion 1/10, density 2/10, reference fidelity 9/10. Preserve the three funding method rows, rounded controls, manual/exchange receiving views and four-item navigation. The Add Money row shows MoonPay; while opening, it shows a spinner and disables duplicate clicks. Failures use one concise inline message.
- Verified provider return routes to Portfolio Activity. Activity records display the provider-selected amount only after a correlated order supplies it; before that they say MoonPay. Status/check/resume/receipt controls are inline, without the removed dialog or redundant network/wallet details. Sandbox completion says Checkout completed, never Deposit confirmed or a credited mainnet balance. MoonPay retains its own environment indicators.
- React review: state changes remain in event handlers, fetch cleanup and identity refresh remain, native handoff is an HTTPS allowlisted same-tab navigation, and expanded activity has aria-expanded/aria-controls. Existing keyboard focus and reduced-motion styles are retained. No SDK or component dependency was added.
- Local production TypeScript/Vite/API build and all 74 tests pass. Visual verification was blocked: agent-browser's daemon exited during startup twice; the cloud browser rejected the local review URL under its URL policy. No workaround was attempted after that policy rejection. Mobile rendered appearance and actual signed-in MoonPay opening are not claimed from source or fixtures.


## Full Home token catalog (2026-10-03 UTC)

- User instruction: remove the pictured Discover heading, NVIDIA feature panel and verbose index intro. Home now begins with a compact Tokens heading, catalog count and Ondo / BNB Smart Chain descriptor, followed immediately by All tokens / Saved, Search and the existing StockCard rows. No replacement promotional panel.
- Design Read: existing app index; newcomer audience; preservation extension; white paper / dark ink; variance 1/10, motion 2/10, density 7/10, asset dependence 8/10, brand fidelity 9/10. Retain Inter/IBM Plex Mono, current light/dark colors, 16px cards, pill actions, focus styles and reduced-motion behavior. Compact top spacing is 36px desktop / 28px phone; pagination buttons are at least 44px.
- Home exposes every one of the 459 chain-56 entries in the issuer's pinned catalog, including stocks, ETFs and portfolio tokens. Search and Saved filter the complete catalog. Render 24 rows per page, show the result count and current range, reset the page on search/filter changes and clamp it after unsaving. Buy and asset files preserve exact symbol/contract selection.
- One shared catalog drives UI and server validation. Keep existing genuine local marks where available; remaining images use the issuer-published CDN logo URLs with lazy loading and a neutral asset placeholder for failed images. The landing page keeps its five-stock preview. Trade has a searchable, scrollable selector and dynamic record count. Portfolio uses bounded multicalls and only requests on-chain decimals for nonzero holdings.
- Home polls one Binance trading-info price batch for the current page every 30 seconds, rather than requesting candles for every token. Search is debounced 250ms. Abort obsolete requests on page/search/tab changes and preserve missing or invalid prices as unavailable. Portfolio batches price requests for held assets. No sample prices, fake liquidity or order execution is introduced.
- Local validation: TypeScript/Vite/API production build and all 78 current tests pass, including exact-contract/chain price validation, request signing, cache coalescing, input bounds, and a full 459-token wallet fixture with 460 balance reads across eight bounded multicalls plus one held-token decimals call. Two retirement regressions replace the four old temporary-capture tests. Rendered deployment review is recorded separately after publishing; fixture results do not establish live price coverage, wallet balances or purchases.
- Deployment preparation: automatic approval review rejected uploading the API bundle because it still contained the earlier temporary support-case signature capture. Removed that capture and its flag from the app, retaining only bounded redacted diagnostics. No credential-material capture remains in the generated function.


## Onramper card funding (2026-10-03 UTC)

- User authorized replacing MoonPay with Onramper for broad card coverage and a simple experience for non-Web3 users. Preserve the existing three Deposit method rows, QR receiving views, light/dark styles and navigation. Only the card provider label/loading copy changes; no amount form, extra modal, network selector or country-specific rule is added.
- Add Money opens the signed Onramper hosted checkout in the same tab with the wallet and BSC USDT output preset, card default and automatic live provider routing. Activity uses provider-aware names for historical records and concise neutral payment statuses. Simulated Onramper completion has no BSC receipt or credited balance.
- Source layout/style are unchanged. Backend fixture validation and deployed observations are recorded in the developer experience report; no real card acceptance is claimed.

## Onramper UI recording (2026-10-04 UTC)

- User requested a UI-only video without partner activation. Open `/app/?tab=portfolio&view=deposit&demo=onramper`; keep normal client sign-in and real account balances. The card row uses the same component, marks and styles, with **Onramper · Demo** as its descriptor.
- Design Read: existing Deposit utility for newcomers; preservation extension; variance 1/10, motion 1/10, density 2/10, reference fidelity 9/10. Reuse the current rows, spinner, inline errors, keyboard controls, themes and navigation. No new payment form, modal or fabricated payment success.
- The demo performs one public read for a test-key-only `.dev` widget URL and uses same-tab navigation. It sends no wallet, identity token, account context or exact asset selection. No FirstBell deposit session, balance credit or stock order is created. The ordinary app keeps its existing funding checks.
