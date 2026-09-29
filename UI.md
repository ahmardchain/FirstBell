# FirstBell UI sources

Before building a new interface component, review the relevant examples from this catalog. Use an existing component when its interaction, accessibility, and license fit FirstBell; adapt its visual language to the product rather than copying an unrelated demo wholesale. Preserve attribution or license notices when required.

## Component libraries to check

| Source | URL | Useful for |
| --- | --- | --- |
| Spectrum UI | https://ui.spectrumhq.in | Premium component treatments |
| 21st.dev | https://21st.dev | Community React components and layouts |
| shadcnblocks | https://shadcnblocks.com | shadcn page sections and blocks |
| React Bits | https://reactbits.dev | Animated React components |
| 8bitcn | https://8bitcn.com | Retro pixel style, only when the brief calls for it |
| Evil Charts | https://evilcharts.com | Animated SVG charts |
| Coss UI | https://coss.com/ui | Modern UI primitives |
| Rare UI | https://rareui.com | Distinctive component patterns |
| BeUI | https://beui.dev | Animated components |

## Existing design references

| Source | URL |
| --- | --- |
| UI Skills | https://ui-skills.com |
| Design System Checklist | https://designsystemchecklist.com |
| ReUI | https://reui.io/components |
| Kinetics | https://kinetics.colorion.co |
| Icon Creator | https://iconcreator.dev |
| Vibe Prompts | https://vibeprompts.dev |
| Animated Buttons | https://animatedbuttons.colorion.co |

## FirstBell application

1. Start with the screen's purpose, state changes, and mobile layout. Check the catalog for matching components and interactions before implementing one.
2. Prefer source components that work with the existing React, TypeScript, Tailwind, and shadcn structure. Put shared primitives in `components/ui`.
3. Keep the FirstBell system: dark ink surfaces, warm white type, restrained cobalt accents, authentic token artwork, clear hierarchy, and quiet motion. Avoid gradients, glow, generic AI icons, and decorative charts.
4. Verify keyboard use, reduced motion, responsive composition, performance, and component licensing before shipping.
5. Keep transaction states truthful: the interface must distinguish card payment, wallet funding, swap, and confirmed token delivery.

The current floating hero was adapted from the user-supplied 21st.dev component prompt. Its tiles use Ondo token images bundled in `public/assets`.
