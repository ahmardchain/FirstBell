# FirstBell

FirstBell is a card-to-tokenized-equity product concept for the BNB Hack: Tokenized Stocks Edition. This repository contains a responsive landing page, not a connected purchase flow.

## Run locally

```bash
npm install
npm run dev
```

`npm run build` runs TypeScript checks and creates the production bundle.

## Structure

- `components/ui/floating-icons-hero-section.tsx`: reusable floating hero with cursor repulsion, reduced-motion support, and a shadcn-style button.
- `components/ui/button.tsx`: local shadcn button primitive.
- `src/demo.tsx`: landing page with the floating hero, purchase journey, interactive token explorer, receipt preview, and issuer/market-hours/fee explanation. The hero has 12 token tiles (8 on mobile).
- `src/styles.css`: Tailwind theme and responsive art direction.
- `public/assets`: bundled token icons and FirstBell SVG mark.
- `asset-sources.json`: official Ondo token-list image URLs and BSC contracts.

Components use the default `/components/ui` path configured in `components.json`; styles live in `src/styles.css`. The project uses Vite, TypeScript, Tailwind CSS, and shadcn-compatible aliases. The shadcn CLI template endpoint was unavailable in the build environment, so the equivalent project structure and button component were added directly.

The five Ondo token icons are from [Ondo's official token list](https://github.com/ondoprotocol/ondo-global-markets-token-list/blob/main/tokenlist.json). The floating tiles repeat these five assets for visual composition. The demo does not imply purchase availability in every jurisdiction.

Card checkout, wallet creation, quotes, simulation, swaps, and token delivery are not connected yet. Do not represent this preview as a working purchase flow.

## Current interface

The landing UI includes a floating token hero, the React Bits Logo Loop, active responsive navigation, English and Simplified Chinese, a dark/light monochrome theme, selectable Ondo asset contracts, an amount field, a transparent purchase preview, and direct BscScan links. Preferences persist in local storage. The UI does not collect payment details or execute trades; a checkout provider, wallet service, live quote source, and transaction tracking must be connected and verified before purchase can go live.

Shared UI primitives live in `components/ui`, and site styles live in `src/styles.css`. The React Bits adaptation and its notice are in `components/ui/logo-loop.tsx` and `third_party/REACT_BITS_LICENSE.md`.
