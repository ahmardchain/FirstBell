# Portfolio and Deposit visual QA

Final result: passed for the requested layout replacement and the existing funding entry flow.

## Scope and references

The user's Portfolio reference (`03-331992.jpg`, 1080 × 1530) and funding-method reference (`02-331995.jpg`, 1080 × 1386) control this implementation. The old FirstBell screenshot (`01-331996.jpg`) identifies the UI being replaced. This review covers the account composition and the page opened by Deposit; it does not claim completed payment or withdrawal execution.

The app was rendered in the cloud browser at a 390 × 552 mobile content viewport, inside a 1363 × 936 review window. References were normalized to the same 390px width for paired visual comparison. A separate 1363 × 936 view checked the larger layout and light-theme RPC error state. All account names, balances and addresses in the development review are explicitly local fixtures, not observations of the user's account. The review fixtures are excluded from the published tree.

## Paired and focused comparison

Saved review evidence in this work session:

- Portfolio pair: `/workspace/scratch/50b2264082e6/portfolio-comparison.jpg`.
- Funding pair: `/workspace/scratch/50b2264082e6/funding-comparison.jpg`.
- Final component captures: `firstbell-portfolio-screen.jpg` and `firstbell-funding-screen.jpg` in the same review directory.

The full paired views and the account-header/balance, action/tab/search, empty-state and funding-row regions were inspected at the normalized scale. The first comparison exposed oversized balance text and icons and an underweight Positions value. Those were corrected before the final comparison.

| Surface | Reviewed result |
| --- | --- |
| Account identity | Same blue raster avatar, inline name and pencil hierarchy; production name comes from the signed-in account or its locally edited alias. |
| Values | Main balance and Positions retain the reference scale and spacing. Eye hides both values and token quantities. Real error/loading/unavailable strings fit the same structure. |
| Controls | Equal Deposit/Withdraw pills, Positions/Activity pills and rounded Search match the reference arrangement. Tabs use 44px targets rather than the reference's slightly shorter target. |
| Empty state | Plain centered No positions found with reference-like whitespace; no card, saved assets or extra account text. |
| Funding methods | Three rounded rows, circular leading icons, overlapping authentic asset badges, muted descriptors and Last Used state. Background and row colors follow the funding reference. |
| Assets and copy | The avatar is the supplied raster; brand badges use real source SVGs. Unverified limits, instant/two-minute promises and unsupported chains from the reference are replaced by actual BNB/card descriptors. |

The funding reference crops out the preceding screen header. FirstBell keeps a compact Back/Deposit header above the copied rows for navigation. The existing app header and mobile bottom navigation remain around the account screen. These are intentional integration choices, not invented additional account sections. Light mode uses the same geometry with the app's existing light palette.

## Interaction checks

- Balance eye switches between values and masking.
- Positions and Activity change the visible panel; Search accepts and filters asset/activity text.
- Deposit opens the separate funding view. Back returns through a receive view, funding methods and Portfolio.
- Transfer Manually shows the exact fixture wallet address and a QR image generated locally from that address.
- Copy places that exact address in the browser clipboard.
- Deposit from Exchange opens the same receiving address with BNB Smart Chain/BEP20 withdrawal instructions.
- Add Money opens the existing card dialog. The local fixture correctly shows configuration unavailable. Escape dismisses it and returns focus to the triggering control.
- Last Used follows the selected funding method.
- Withdraw is visibly disabled; no transfer is implied or submitted.

The positive-holdings fixture showed a real token row and Value unavailable when the local market service could not return a price. The light RPC-error fixture showed Balance unavailable rather than zero. No horizontal document overflow was observed in the larger state review. The final mobile capture has no clipped primary controls. Browser console inspection found no application errors/warnings; unrelated browser-extension messages were excluded.

## Automated validation and limits

`npm run build` passes TypeScript, the frontend production build and the server API bundle. The existing deposit and Vercel-migration suites pass all 28 tests. `git diff --check` passes. Existing third-party bundle-size/PURE annotation warnings remain non-blocking.

No authenticated live-user account, paid checkout, wallet transfer, stock order or withdrawal was executed in this review. The real Privy and checkout wiring remains in production code. The local review fixture is not evidence that a live provider transaction succeeded. Smaller viewport rules, reduced motion and focus styles were also reviewed in source; they were not independently measured across every device/browser.

No actionable P0, P1 or P2 visual/layout issue remains in the reviewed scope. The intentional differences and unverified live transaction paths are listed above.
