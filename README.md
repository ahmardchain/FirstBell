# FirstBell

FirstBell is a landing page and research app for exploring tokenized equities on BNB Smart Chain. It presents issuer, network, token symbol, contract address, and public source links for five example Ondo Global Markets assets. Live trading and wallet connections are not available yet.

## Run locally

```bash
npm install
npm run dev
```

Build with `npm run build`.

## Interface

- The hero adapts the user-supplied floating-icons component in `components/ui/floating-icons-hero-section.tsx` and uses transparent company SVG marks listed in `brand-mark-sources.json`. The asset symbols and contract data are from the [Ondo token list](https://github.com/ondoprotocol/ondo-global-markets-token-list/blob/main/tokenlist.json).
- The [React Bits Logo Loop](https://reactbits.dev/animations/logo-loop) and [Scroll Float](https://reactbits.dev/text-animations/scroll-float) adaptations live in `components/ui/`. Scroll Float uses GSAP ScrollTrigger for the section headings and footer statement, and shows plain text when reduced motion is requested. Their license notice is in `third_party/REACT_BITS_LICENSE.md`.
- `src/demo.tsx` contains the landing. `/app/` is a separate route with Home, Trade, Agent, and Portfolio in `src/app.tsx`.
- Home has a searchable catalog and source-linked asset files. Bookmarks persist in the current browser. Trade provides an asset selector, the [Spectrum UI Market Chart](https://ui.spectrumhq.in/blocks/charts#market) in its no-data state, contract details, and an interactive Buy/Sell sheet. Live token price candles, quotes, wallet balances, and execution require integrations and are not represented as available. Agent answers fixed issuer, contract, and network questions from the token list. Portfolio displays saved assets, not wallet holdings.
- Spectrum chart source is in `components/spectrumui/charts/`; its Apache 2.0 license is in `third_party/SPECTRUM_UI_LICENSE.txt`. The app supplies an empty dataset until a verified token-specific OHLC feed is connected. The chart's demo-generated prices are never shown as token prices.
- `src/styles.css` defines a sharp monochrome system. Light mode uses white surfaces. Inter and IBM Plex Mono are self-hosted through Fontsource packages.
- `AGENTS.md` contains the project design workflow and `UI.md` records the FirstBell-specific visual contract.

The `App` navigation item opens `/app/`. The company marks are visual navigation cues, while issuer and contract details are derived from `asset-sources.json`; the external contract links open BscScan. No price, entitlement, or availability is inferred from the ticker alone.
