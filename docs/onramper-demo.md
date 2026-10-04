# Onramper UI recording

Open `/app/?tab=portfolio&view=deposit&demo=onramper`, sign in normally, and choose **Add Money**. The card row says **Onramper · Demo**. It opens Onramper's own `.dev` widget in the same tab.

This path uses only the existing `ONRAMPER_API_KEY` test publishable key. It does not need the signing key, webhook secret or BSC USDT asset ID because it does not prefill a wallet or create a tracked funding session. It does not update FirstBell balances, activity or stock holdings. The normal app URL retains the full funding checks.

The widget uses Onramper's documented Banxa/EUR/GBP sandbox settings and card default. Provider availability still applies; the demo route does not change country or bypass access restrictions. No real card details are needed for a UI recording.

Sources: [widget parameters](https://docs.onramper.com/docs/supported-widget-parameters), [testing overview](https://docs.onramper.com/docs/testing-overview), [V2 signing](https://docs.onramper.com/docs/widget-sign-a-url-v2).

Design Read: preserve the existing Deposit utility for newcomers; visual variance 1/10, motion 1/10, density 2/10, reference fidelity 9/10. Reuse the current method rows, real payment marks, spinner, inline error, themes and navigation. Add only the demo descriptor, with no new form or dialog.
