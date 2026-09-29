# FirstBell

FirstBell is an independent landing page and asset index for exploring tokenized equities on BNB Smart Chain. It presents issuer, network, token symbol, contract address, and public source links for five example Ondo Global Markets assets. This site is for discovery and research; it does not offer trading or account services.

## Run locally

```bash
npm install
npm run dev
```

Build with `npm run build`.

## Interface

- The hero adapts the user-supplied floating-icons component in `components/ui/floating-icons-hero-section.tsx` and uses real token images from the [Ondo token list](https://github.com/ondoprotocol/ondo-global-markets-token-list/blob/main/tokenlist.json).
- The [React Bits Logo Loop](https://reactbits.dev/animations/logo-loop) adaptation is in `components/ui/logo-loop.tsx`. Its license notice is in `third_party/REACT_BITS_LICENSE.md`.
- `src/demo.tsx` contains the landing, searchable asset index, English/Simplified Chinese copy, and theme control.
- `src/styles.css` defines a sharp monochrome system. Light mode uses white surfaces. Instrument Sans and IBM Plex Mono are self-hosted through Fontsource packages.
- `AGENTS.md` contains the project design workflow and `UI.md` records the FirstBell-specific visual contract.

The `App` navigation item opens the on-page asset browser. The issuer and contract details are derived from `asset-sources.json`; the external contract links open BscScan. No price, entitlement, or availability is inferred from the ticker alone.
