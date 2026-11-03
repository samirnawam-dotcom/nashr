# Nashr design system

Nashr is a B2B marketplace in the UAE where media buyers bid on and book advertising slots (print, digital, radio, TV, podcast) and media outlets sell them. Users are media directors, agency planners and finance teams handling bookings worth AED 5,000 to 500,000. The product must feel as trustworthy as a bank and as easy as Airbnb.

## Principles
- Calm, precise, enterprise-grade. Information first, decoration never.
- The slot calendar is the heart of the product; every screen leads to or from it.
- Every number is exact and aligned: tabular figures, currency first ("AED 24,000"), right-aligned in tables.
- State is always visible at a glance through small status chips, never through colour alone (chip = colour + label).

## Colour
- Primary teal #0F6B6B only for the main action on a screen, selected states and the bid heat map.
- Ink #1B2430 for headings and figures; slate #5D6876 for secondary text; hairline borders #E3E6EB.
- Background #F6F7F9; surfaces pure white.
- Status: green #1D7A46 (secured, released, paid), amber #9A5B00 (awaiting, closing soon), red #A8291F (declined, disputed, overdue), blue #2563EB (information only). Status chips use a 10% tint background with the full colour text.
- Heat map: 5 steps of teal tint from #F0F7F7 to #0F6B6B by number of bids.

## Typography
- Headings Geist, body IBM Plex Sans (pairs with IBM Plex Sans Arabic for Arabic text).
- Scale: page title 32/40 semibold, section 20/28 semibold, body 15/24, table and labels 14/20, captions 12/16. Uppercase micro-labels 11px with 0.06em letter spacing, used sparingly.
- At most three type sizes inside any card.
- Numbers use tabular figures.

## Layout
- 8px spacing grid. Page padding 32px desktop. Card padding 20-24px. Max content width 1440px.
- Top bar 64px with logo, primary navigation, search, notifications bell with count, account menu.
- Dense data screens use tables and grids with 44-48px rows, sticky headers, and a filter bar above.
- Right-hand side panels and drawers (400-480px) for detail, so the user never loses the calendar.

## Components
- Corners 8px on cards, inputs and buttons; 6px on chips. 1px hairline borders; shadow only on floating drawers and menus.
- Buttons: primary solid teal, secondary white with border, tertiary text. One primary per view.
- Inputs 40px high with visible labels above (never placeholder-only).
- Countdown shown as "Closes in 18h 20m" with a clock icon, in the outlet's local time.
- Money breakdowns in a right-aligned two-column list with a bold total line.
- Empty, loading and error states are designed, not blank.

## Premium finish (quality bar: Stripe Dashboard, Linear, Airbnb)
- Quiet by default: whitespace and alignment create structure, not boxes. Prefer one hairline divider over a bordered card; nest cards never more than one level.
- Status is a small coloured dot + plain text label ("● Closing in 18h"). Filled pills only for things that need the user's action now ("Action needed", "Outbid"). Never more than one badge per item.
- Colour budget per screen: neutrals + teal + at most the status colours actually in use. No amber or red backgrounds on whole cells or cards; colour sits in the dot, the text or a 3px left edge.
- Generous rhythm: 24px between related groups, 40-48px between sections. Tables 52px rows. Cards 24px padding.
- Icons: one consistent 1.5px line icon set (Lucide style), 18-20px, neutral colour unless active.
- One clear focal point per screen; secondary information in slate, tertiary in lighter slate.
- Consistent app shell on every screen: 64px top bar, logo left, nav centre-left, search, bell, avatar right; never wraps. Seller outlet switcher is a single compact line ("Skyline FM ▾").
- Microcopy short and human. Numbers large and calm, labels small and quiet.
- Hover and selected states visible: selected = teal 2px outline + light teal fill; hover = light grey fill.

## Product rules every screen must respect
- Today is early November 2026. Dates are in 2026.
- Top bar for buyers: logo "Nashr" (word only, never "Nashr Media Marketplace"), nav: Calendar, Directory, Campaigns, Bookings; then search, notifications bell, account. Sellers: Calendar, Inbox, Deals, Earnings, Rate card. Admin uses a left sidebar instead. Nav labels never wrap.
- Buyers NEVER see a seller's reserve price, the word "reserve", or Nashr's commission rate. Only sellers see "Below your reserve".
- Bidders are anonymous to other buyers ("Bidder B").
- Minimum next bid = current top bid + 3%. Show it as "Min next bid AED 23,175".
- Buy-now is a REQUEST the seller must accept: label "Request at AED 32,000", never "instant", "Quick Buy" or "lock". Nothing is charged until the seller accepts and the buyer confirms payment.
- Quick sale slots show a "Quick sale" tag and "Show interest", with no countdown.
- Prices shown exclude VAT.
- Plain business English; no jargon such as "guardrails", "headroom", "broker".

## Never
- Never invent legal, regulatory or certification claims: no "regulated", "licensed", "Central Bank", "UAE Media Council/NMC", "DDA", "certified", "guarantee", "100% protection". No invented company legal names, licence numbers or tax numbers (use "TRN on file" instead). No testimonials or quotes from named people. No launch dates for KSA.
- Do not use the word "escrow". Say "payment secured" and "held securely until you approve the proof". Payments are by card only (Stripe); never show bank transfer or wire options.
- Payment, fee and VAT wording: buyers see price, 5% VAT (when the publisher is VAT-registered) and total; never a Nashr fee line.
- Icons must render as icons; never show icon names as text (e.g. "check_circle", "lock", "shield", "sync").
- Footer: "© 2026 Nashr" with links Terms, Privacy, Help. Nothing else.
- No stock photos, 3D illustrations, gradients, glassmorphism, emoji, or decorative blobs.
- No more than one accent colour per screen besides status colours.
- No lorem ipsum: use realistic UAE media data (Gulf News, Khaleej Times, Skyline FM, Dubai One TV) and AED amounts.

---
Applied in Stitch project "Nashr" (fonts: Geist headings, IBM Plex Sans body; corners 8px; primary #0F6B6B; light mode).
