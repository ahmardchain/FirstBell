# FirstBell UI sources

Before building a new component, review a suitable source in this catalog and adapt its interaction to the product. Preserve required license notices.

| Source | URL | Use |
| --- | --- | --- |
| 21st.dev | https://21st.dev | Floating icon hero source pattern |
| React Bits | https://reactbits.dev/animations/logo-loop | Token asset logo loop |
| shadcn/ui | https://ui.shadcn.com | Shared accessible primitives |
| Spectrum UI | https://ui.spectrumhq.in | Premium treatments |
| shadcnblocks | https://shadcnblocks.com | Page sections |
| Rare UI | https://rareui.com | Distinctive components |
| Coss UI | https://coss.com/ui | Modern primitives |
| BeUI | https://beui.dev | Animated patterns |
| Evil Charts | https://evilcharts.com | SVG data charts |
| 8bitcn | https://8bitcn.com | Retro style only when requested |

## System

- Monochrome ink and warm white. Theme control switches light and dark surfaces; no ungrounded accent colors.
- A translucent, blurred navigation bar and asset panel provide restrained glass treatment. Token images float directly, without surrounding icon tiles.
- Motion clarifies a transition or adds quiet atmosphere. Respect reduced motion, keyboard focus, and mobile layouts.
- English and Simplified Chinese copy are kept together in `src/demo.tsx`; switching languages persists locally and updates the document language.
- The `components/ui/floating-icons-hero-section.tsx` component adapts the user-provided 21st.dev pattern for real Ondo token artwork. `components/ui/logo-loop.tsx` is adapted from React Bits; see `third_party/REACT_BITS_LICENSE.md`.
- Card payments, wallet creation, quotes, and on-chain purchases are not connected. The amount panel and purchase preview must never imply a completed order or show fabricated quote data.
