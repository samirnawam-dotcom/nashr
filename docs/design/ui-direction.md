# UI direction (built), Nov 2026

The app's visual identity before Omar's brand files arrive. Every colour and font is a token in `web/src/styles.css` (`:root`), so the brand pass is a token swap, not a rewrite. Guided by the vendored `frontend-design` skill (Anthropic, Apache 2.0).

**Idea.** Nashr (نشر) means to publish or broadcast. The identity borrows from a broadcast studio: a deep-teal "studio" shell, Omar's approved teal for actions, and one saffron "on-air" signal that only lights up for live, urgent moments.

| Token | Value | Use |
|---|---|---|
| `--teal` | `#0F6B6B` | Primary actions, links, selected states (approved by Omar, round 2) |
| `--studio` | `#0A4545` | Top bar, sign-in hero |
| `--signal` | `#E5A21B` | On air: bidding closing soon, the active nav item, the Arabic wordmark, "needs attention" tiles. Never decoration |
| `--ink` / `--slate` / `--faint` | `#17212B` / `#56616E` / `#66717F` | Text. `--faint` was darkened to pass contrast for small text |
| `--bg` / `--surface` | `#F6F7F6` / `#FFFFFF` | Page and panels |

**Type.**
- Headings: Geist. Text: IBM Plex Sans (both approved).
- Reem Kufi is used only for the bilingual wordmark "Nashr نشر" and the large نشر on the sign-in hero: the one bold move.
- Arabic body text, such as outlet names, stays in IBM Plex Sans Arabic for legibility; Kufi is a display face.

**Rules.**
- Statuses are tinted pills (green leading or done, amber waiting, red outbid or problem).
- Labels are sentence case. No all-caps eyebrows.
- Visible keyboard focus everywhere (a teal ring; saffron in the dark bar). Reduced motion is respected.
- Phones (900 px and below):
  - the top bar collapses into a menu
  - the calendar becomes a day-by-day list, with filters behind a button
  - segmented controls and tables scroll inside themselves; the page never scrolls sideways

**When the brand arrives.**
- Replace the `--teal`, `--studio` and `--signal` values and the font families.
- Swap the `Wordmark` component in `web/src/App.tsx` and the hero mark in `web/src/Login.tsx` for the logo.
- Re-run `npm run e2e` and the screenshots.

## Stitch v3 (professional pass)

- Stitch design system "Nashr v3 Professional Studio" (`assets/8264616920506566350` in project 9500135600237380992) encodes these tokens and the content rules.
- Seven reference screens are in `docs/design/stitch-v3/`.

Adopted in the app:
- the 5-step booking tracker, with work on the left and the money summary fixed on the right
- price tiles, AED-prefixed amounts and quick raises in the bid panel
- calendar blocks showing the time range and the outlet, with a colour key and a payment-held note
- a greeting and an action button on each publisher task
- the reconciliation strip, hairline figures, attention list and stacked status bar on the admin overview
- a bottom tab bar on phones

Left out on purpose:
- buyers seeing "Reserve met"
- invented badges and claims ("GST/VAT compliant ledger", "Institutional media exchange", "Audit Node DXB-01")
- a manual payout trigger (payouts are automatic)
- "Keep me signed in 30 days" (sessions last 12 hours) and "Forgot password" (not built yet)
