# Nashr: Google Stitch prompts

How to use:
1. Start a **Web** project in Stitch.
2. Paste the **style prompt** first. Then paste one **screen prompt** at a time, in order.
3. After each screen, iterate in small steps ("make the calendar cells taller", "move the bid panel to the right").
4. When the owner's brand files arrive, replace the colour and font lines in the style prompt and regenerate.

Placeholders: colours and fonts below are temporary until Nashr's brand files arrive. All names, outlets and amounts are realistic sample data.

---

## 0. Style prompt (paste first)

```
Design system for "Nashr", a B2B web marketplace in the UAE where companies book and bid on advertising space (newspapers, websites, radio, TV, podcasts) from media outlets. The calendar of ad slots is the heart of the product.

Style: clean, calm and trustworthy, inspired by Airbnb's clarity. Lots of white space, white surfaces on a very light warm-grey background, 12px rounded cards, subtle 1px borders instead of heavy shadows, one accent colour used sparingly for primary actions.
Colours (temporary): deep teal #0F6B6B primary, near-black #1B2430 text, slate #5D6876 secondary text, light grey #F5F6F8 background. Status colours: green for secured/released, amber for awaiting/closing soon, red for declined/disputed.
Typography: Inter for Latin text, IBM Plex Sans Arabic for Arabic text; tabular numbers for all prices.
Money is always shown as "AED 20,000" with the currency first.
Desktop web app, 1440px wide, top navigation bar with logo "Nashr" on the left. Layouts must also work on tablet.
Tone of copy: plain business English, short labels, no jargon.
```

---

## 1. Landing page and Request access

```
Landing page for Nashr. Hero: headline "Book media across the UAE in one place", subline "See prices and availability, bid or book, pay securely, and get proof your ad ran." Primary button "Request access", secondary "How it works".
Below: a preview image of the slot calendar. Then a 4-step "How it works" row: Find a slot, Bid or book, Pay securely (money held until proof), Approve the proof.
Section "Who it's for" with two cards: Advertisers and agencies (free), Media outlets (list your ad space, get paid on delivery).
Section with logos of channels: Print, Digital, Radio, TV, Podcast.
"Saudi Arabia, coming soon" banner with "Join the waiting list".
Request access form in a right-hand card: company name, company type (Brand, Agency, Media outlet), work email (note: business emails only), website, trade licence number, your role, markets (UAE; KSA shown as coming soon, disabled), expected yearly media spend. Button "Request access". Note: "Access is invite-only. We reply within 2 business days."
```

## 2. Buyer home: the calendar (main screen)

```
Main buyer screen of Nashr: the slot calendar, full width, with a right side panel.
Top filter bar: channel tabs (All, Print, Digital, Radio, TV, Podcast), market (UAE), language (Arabic, English, Bilingual), outlet search, price range, "Closing soon" toggle.
Calendar grid: rows are placements (e.g. "Gulf News · Full page", "Khaleej Times · Half page", "Skyline FM · Morning Markets 06:30–09:00", "Dubai One TV · Market Open", "The Majlis Podcast · Mid-roll"); columns are weeks or days (Week of 9 Nov, 16 Nov, 23 Nov, 30 Nov). Each cell is a slot showing the price "AED 20,000", a small bid count, and its status. Cells get a darker teal shade the more bids they have (heat map). Status chips: Open, 3 bids, Closing in 18h (amber with countdown), Quick sale tag, Not listed (grey).
Radio and TV rows show the time window under the name.
Checkboxes on cells to select several slots, with a bottom bar "3 slots selected · Bid on all".
Right side panel "Bid desk": campaign budget meter (AED 180,000 budget, AED 96,000 committed if you win everything), list "You're leading" (2), "Outbid" (1, with "Raise bid" link), "Closing soon" (3).
```

## 3. Slot detail and bid form (drawer)

```
A right-hand drawer opened from a calendar slot in Nashr. Header: "Gulf News · Full page · Week of 9 Nov", outlet logo, channel tag Print, language English.
Price block: Starting price AED 20,000, Current top bid AED 24,000 (5 bids, bidders anonymous), Minimum next bid AED 24,720 (3% step), Buy now AED 32,000. Countdown "Bidding closes in 2 days 6 hours (Dubai time)".
Small chart "Recent winning prices for similar slots" and a "Suggested bid AED 25,500" hint.
Bid form: your bid amount, and the Booking brief: advertiser or brand, industry (dropdown), what the ad will say (280 characters with counter), creative language (Arabic, English, Bilingual), landing page link, upload draft or tick "Creative to follow", notes for the publisher (warning: emails and phone numbers are not allowed).
Card on file: "Visa •••• 4242, verified". Clear note: "Nothing is charged now. You pay only if the publisher accepts."
Buttons: primary "Place bid", secondary "Buy now for AED 32,000". Small text: prices exclude VAT.
```

## 4. Confirm payment

```
Nashr payment confirmation page after the publisher accepted the buyer's bid. Header: green banner "Gulf News accepted your bid. Confirm payment within 47h 12m."
Left: booking summary card (Gulf News · Full page · Week of 9 Nov, insertion order NSH-2026-000187, material deadline 5 Nov, run date 9 Nov).
Right: payment card with breakdown: Price AED 76,000, VAT 5% AED 3,800, Total AED 79,800. Note: "Nashr collects this payment on behalf of Gulf News. The tax invoice is issued by Nashr on behalf of the publisher."
Saved card selector and "Add card". Button "Confirm and pay AED 79,800". Small text: "Your bank may ask you to authenticate. The money is held securely and only released to the publisher after you approve proof that the ad ran." Links: cancellation policy, receipt will be emailed.
```

## 5. Booking page (timeline, creative, proof review)

```
A booking detail page in Nashr for a buyer. Header: "Gulf News · Full page · Week of 9 Nov", status chip "Proof ready, review", reference NSH-2026-000187, amount AED 79,800.
Left: vertical timeline with steps and dates: Bid placed, Accepted, Payment secured, Creative sent, Creative approved, Pre-run check confirmed, Ad ran, Proof sent (current), Released, Paid out (future steps greyed).
Main area: Proof review card showing an uploaded tearsheet image thumbnail and a checklist "Required for print: tearsheet showing page and position ✓". Text: "Approve within 5 working days or it will be approved automatically on 18 Nov."
Three buttons: primary "Approve", secondary "Report an issue", tertiary disabled "Raise a dispute (after an issue)".
Side card: documents (Insertion order, Payment receipt, Tax invoice issued on behalf of Gulf News, download icons) and a "Messages with Gulf News" thread preview.
```

## 6. Directory

```
Directory page in Nashr where buyers research media outlets, including ones not yet on Nashr. Search bar and filters on the left: country (UAE; Saudi Arabia marked coming soon), sector, language, tier, channel.
Results as cards in a grid: outlet logo, name in English and Arabic (e.g. "Gulf News · غلف نيوز"), channels, audience estimate, and price ranges per placement with a label: "Typical on Nashr" (green, confirmed), "Publisher's rate" (blue), or "Estimate, unconfirmed" (grey).
Cards for outlets on Nashr show a button "Book slots"; others show "Request quote". Some cards have a small "Trusted publisher" badge. Saudi outlets show a "Coming soon" tag and an "Add to plan" button only.
Top right: "Campaign plan: 6 outlets · AED 240,000 of AED 300,000 budget".
```

## 7. Outlet profile

```
Outlet profile page in Nashr, styled like an Airbnb listing. Hero with outlet logo, name "Skyline FM", tags (Radio, English, Dubai), audience "Approx. 450,000 weekly listeners", badges "Trusted publisher", "Responds in about 3 hours", "98% on-time proof".
Short description. Section "Placements" listing each with time window and starting price: Morning Markets, Sun–Thu 06:30–09:00, from AED 6,500 per airing; Drive Home, 16:00–19:00, from AED 5,000.
A mini calendar of upcoming available airings for the selected placement, with price per day.
Specs section: ad length 30s, audio format, material deadline 2 days before.
Right sticky card: "From AED 6,500 per airing", button "See all slots", and the line "You pay only after the station accepts. Money is held until proof."
```

## 8. Seller calendar

```
Seller (media outlet) calendar in Nashr for "Skyline FM". Toggle at the top: "Week grid" / "Programme view".
Programme view: time-of-day schedule with rows for 06:00 to 22:00 and columns Sun to Sat; programme blocks like "Morning Markets 06:30–09:00" in each weekday column, each showing price, bids count and status (Open, 2 bids, Awaiting your decision, Secured, Blocked).
Selecting blocks shows a bulk-edit bar: "4 airings selected · Change price · Block · Copy to next weeks · Set as quick sale".
Top KPIs strip: Net earnings this month AED 84,200, Deals completed 12, Average sale price AED 7,050, Stripe payout account: Verified.
Button "Add placement".
```

## 9. Seller inbox: bids to review

```
Seller inbox in Nashr, list on the left and detail on the right.
List items by priority: "Buy-now request · AED 32,000 · reply within 22h" (highlighted), "Auction closed · top bid AED 24,000 · Below your reserve", "Creative to approve", "Proof due tomorrow", "Buyer question".
Detail for the selected auction: slot "Gulf News · Full page · Week of 9 Nov", verified buyer "Northwind Fintech" (no contact details shown), advertiser, industry Banking, ad message text, language, landing page, creative status.
Money box: Winning bid AED 24,000, Nashr fee 12% AED 2,880, VAT on fee AED 144, You receive AED 20,976 (+ VAT collected for you if VAT-registered).
Automatic checks with icons: Category allowed ✓, No competitor booked in same issue ✓, Creative to follow ⚠.
Other bids list: "Bidder B · AED 23,200", "Bidder C · AED 22,000" with "Choose this bid instead".
Buttons: "Accept", "Decline (reason required)", "Ask the buyer a question (+12h)". Countdown "Decide within 19h 40m".
```

## 10. Seller: add a radio placement

```
Form in Nashr for a media outlet to add a new Radio placement, in steps on one page.
Step 1 Details: programme name, days of the week as tap-to-select pills (Sun to Sat), start time and end time (24-hour pickers, note "Overnight times like 23:00 to 02:00 are fine"), ad break structure (e.g. 4 spots of 30 seconds), live reads toggle, audio specifications.
Step 2 Schedule: active from/to dates, blackout dates, add a seasonal schedule (e.g. "Ramadan schedule" with different times).
Step 3 Selling: how it's sold (Auction, Auction with buy-now, Quick sale) as cards; starting price; buy-now price; reserve price (private, optional, off by default); auto-accept at or above reserve toggle; bidding closes 2 days before; creative due 2 days before.
Step 4 Listing: list for 4, 8, 12 weeks, until a date; live counter "This creates 40 airings".
Warning example: "This overlaps with Drive Home on Tuesdays."
```

## 11. Admin overview

```
Admin overview dashboard for Nashr operations. KPI row: Commission earned AED 412,000, GMV AED 3.4M, Take rate 12.1%, Net take after card fees 9.4%, Active listings 1,240, Buyers active in 30 days 38. Each KPI has a small trend and is clickable.
Chart: commission and GMV by month, toggle by market.
Right column "Needs your decision" queue: Dispute (Skyline FM · ran on wrong date), Resolve-by date in 3 days, Proof overdue, Access request pending (3).
Below: tabs Accounts, Access requests, Publishers, All deals, Disputes, Funds, Payouts, Audit log, Settings, with the All deals table visible: reference, outlet and placement, buyer, amount, status chip, stage, actions; search box, filters (status, market, channel, publisher, buyer, dates) and "Export CSV".
Left sidebar navigation for all admin sections. Small "2FA on" indicator by the admin's name.
```

## 12. Funds page (admin)

```
Admin "Funds" page in Nashr showing where all buyer money currently sits. Table by publisher with columns: Publisher, Market, Secured, In buyer review, Released (awaiting payout), Paid out, Refunded. Amounts in AED, each clickable to open the bookings behind it. Total row at the bottom.
Reconciliation banner under the table, green: "Secured + In review + Released + Paid out + Refunded = AED 3,412,800 · Total paid in AED 3,412,800 · Matches Stripe".
Side card "Refund costs this month": refunds 4, card fees lost AED 2,140, recovered from publishers AED 1,600, net loss AED 540.
```

## 13. KSA coming soon

```
Simple page in Nashr: "Saudi Arabia is coming soon". Short text: "We are preparing to open Nashr in KSA. Saudi outlets are already in the directory so you can plan; booking opens soon." Bilingual heading with Arabic "قريباً في المملكة العربية السعودية".
Waiting list form: name, company, work email, role (Advertiser, Agency, Media outlet). Button "Join the waiting list". Three small cards: Prices in SAR with AED equivalent, Local working week (Sun–Thu), Saudi outlets you can add to plans now.
```
