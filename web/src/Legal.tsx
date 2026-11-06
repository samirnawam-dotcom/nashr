import { PAGES, breadcrumb, useMeta } from './seo'
import { PhotoBand } from './PhotoBand'

/*
 * Terms, privacy and refund policy. DRAFTS written from how Nashr actually works (the timers and fees are the
 * defaults in the settings table); a UAE lawyer must review them before real money moves. Bracketed blanks are for the owner.
 */
const UPDATED = '6 November 2026'
const ENTITY = '[Nashr legal entity name]', LICENCE = '[trade licence number and issuing authority]', ADDRESS = '[registered address, UAE]', CONTACT = '[support email]'

const PHOTO: Record<string, string> = { '/terms': '/brand/print-wide.jpg', '/privacy': '/brand/desk-wide.jpg', '/refunds': '/brand/campaigns-wide.jpg' }

function Page({ title, path, children }: { title: string; path: string; children: React.ReactNode }) {
  useMeta({ ...PAGES[path], jsonLd: [breadcrumb([['Nashr', '/'], [title, path]])] }, [path])
  return (
    <main className="legal">
      <PhotoBand img={PHOTO[path] ?? '/brand/print-wide.jpg'} title={title} sub={`Last updated ${UPDATED}`} focus={path === '/privacy' ? '60% 18%' : undefined} />
      <p className="warn" role="note"><b>Draft for legal review.</b> This text describes how Nashr works today. It is not final until approved by a UAE lawyer.</p>
      {children}
      <nav className="legal-links small" aria-label="Legal"><a href="/terms">Terms of use</a><a href="/privacy">Privacy policy</a><a href="/refunds">Refunds and cancellations</a></nav>
    </main>
  )
}

export function TermsPage() {
  return (
    <Page title="Terms of use" path="/terms">
      <h2>1. Who we are</h2>
      <p>Nashr is operated by {ENTITY}, licence {LICENCE}, {ADDRESS} ("Nashr", "we"). Nashr is an online marketplace where brands and agencies ("buyers") book advertising from radio, TV, print, digital and podcast outlets ("publishers").</p>
      <h2>2. Accounts</h2>
      <ul>
        <li>Nashr is invite-only. Accounts are for businesses in the markets Nashr serves; you must be authorised to act for your company.</li>
        <li>Keep your password and any authenticator app private. You are responsible for what happens under your account.</li>
        <li>We may suspend an account that breaks these terms, puts other users at risk, or is required to be suspended by law.</li>
      </ul>
      <h2>3. Nashr's role</h2>
      <p>The publisher sells the advertising and is responsible for running it. Nashr provides the marketplace, collects the buyer's payment, holds it, and pays the publisher once the ad has run, acting as the publisher's agent for collection. Nashr is not a party to the creative content of an ad.</p>
      <h2>4. Bids and bookings</h2>
      <ul>
        <li>Prices are shown excluding VAT. VAT is added at payment where the publisher is VAT-registered, and shown before you pay.</li>
        <li>A bid is a binding offer for that slot at that price. You can raise it, but not withdraw it while it leads.</li>
        <li>A request at the buy-now price, or interest in a quick-sale slot, is a request to book. Nothing is charged until the publisher accepts.</li>
        <li>The publisher has 24 hours to accept or decline. Once accepted, the buyer has 48 hours to pay (less if the creative deadline is close). An unpaid booking lapses.</li>
      </ul>
      <h2>5. Payment, holding and release</h2>
      <ul>
        <li>Payments are processed by our payment provider. Nashr never sees or stores full card numbers.</li>
        <li>The money is held by Nashr until the publisher sends proof that the ad ran. The buyer then has 5 working days to approve the proof or report an issue; after that it is approved automatically.</li>
        <li>On approval, Nashr pays the publisher the price plus any VAT, less Nashr's commission (and VAT on it, where applicable).</li>
      </ul>
      <h2>6. Creative and content</h2>
      <ul>
        <li>The buyer supplies creative by the creative deadline shown on the booking and confirms it has the rights to use it.</li>
        <li>The publisher may reject creative that breaks the law, its standards or the brief, with a reason. Ads must comply with UAE media content standards and advertising laws.</li>
        <li>Sharing email addresses or phone numbers to arrange deals outside Nashr is not allowed. Bookings found on Nashr must be paid through Nashr.</li>
      </ul>
      <h2>7. Publishers</h2>
      <ul>
        <li>Publishers list only inventory they can deliver, at the dates and times listed, and run accepted ads as booked.</li>
        <li>Publishers must send truthful proof (as-run logs, tear sheets, screenshots) by the proof deadline.</li>
        <li>Publishers are responsible for their own tax obligations, including VAT on the media they sell.</li>
      </ul>
      <h2>8. Cancellations, issues and disputes</h2>
      <p>Cancellations and refunds follow the <a href="/refunds">Refunds and cancellations policy</a>. If a buyer reports an issue with proof, release of the money pauses and the publisher can respond or offer a make-good. If the two sides do not agree, Nashr decides on the evidence on both sides, and Nashr's decision decides where the held money goes.</p>
      <h2>9. Liability</h2>
      <p>To the extent the law allows, Nashr is not liable for indirect or consequential loss, or for the content of ads. Nashr's total liability for a booking is limited to the amount Nashr holds or received for that booking. Nothing in these terms limits liability that cannot be limited by law.</p>
      <h2>10. Changes</h2>
      <p>We may update these terms. Changes do not affect bookings already accepted. We will tell account holders of material changes before they apply.</p>
      <h2>11. Law</h2>
      <p>These terms are governed by the laws of the United Arab Emirates as applied in [Emirate]. Disputes go to the courts of [Emirate / free zone courts], unless the law says otherwise.</p>
      <h2>12. Contact</h2>
      <p>{CONTACT}</p>
    </Page>
  )
}

export function PrivacyPage() {
  return (
    <Page title="Privacy policy" path="/privacy">
      <p>This policy explains what personal data {ENTITY} ("Nashr") collects, why, and your rights, in line with the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021).</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Access requests and accounts:</b> name, work email, phone, job title, company, company type, and the company's tax registration number (TRN).</li>
        <li><b>Marketplace activity:</b> bids, bookings, booking briefs, creative files, proof files, messages through Nashr, issues and disputes.</li>
        <li><b>Payments:</b> amounts, dates and payment status. Card details go directly to our payment provider; Nashr never sees or stores full card numbers.</li>
        <li><b>Security and logs:</b> sign-in times, IP addresses, and a record of important actions (the audit log).</li>
      </ul>
      <h2>Why we use it</h2>
      <ul>
        <li>To run the marketplace: accounts, bookings, payments, payouts, invoices and receipts (performance of a contract).</li>
        <li>To meet legal duties such as tax records and anti-fraud checks (legal obligation).</li>
        <li>To keep Nashr secure and improve it (legitimate interests).</li>
      </ul>
      <p>We do not sell personal data and do not use it for third-party advertising.</p>
      <h2>Who sees it</h2>
      <ul>
        <li>The other side of a booking sees your company name and the booking details. Contact details are not shared between buyers and publishers.</li>
        <li>Service providers who work for us: the payment provider, hosting, and email delivery. They use the data only to provide their service.</li>
        <li>Authorities, where the law requires it.</li>
      </ul>
      <h2>Where it is kept and for how long</h2>
      <p>Data is stored on servers in [location]. Booking, payment and tax records are kept for at least the period UAE tax law requires (currently [x] years). Other account data is deleted or anonymised [x] months after an account closes.</p>
      <h2>Cookies</h2>
      <p>Nashr uses one essential cookie to keep you signed in. There are no advertising or tracking cookies.</p>
      <h2>Your rights</h2>
      <p>You can ask to access, correct or delete your personal data, to restrict or object to its use, or to receive it in a portable form, within the limits of the law (for example, tax records must be kept). Write to {CONTACT}. You can also complain to the UAE Data Office.</p>
      <h2>Contact</h2>
      <p>{ENTITY}, {ADDRESS}. {CONTACT}</p>
    </Page>
  )
}

export function RefundsPage() {
  return (
    <Page title="Refunds and cancellations" path="/refunds">
      <p>Your payment is held by Nashr until the publisher proves the ad ran. These are the rules for getting money back. The exact amounts are always shown on the booking before you confirm.</p>
      <h2>Before you pay</h2>
      <p>Bids and requests cost nothing until the publisher accepts and you pay. If the publisher declines, or you do not pay within the payment window, the booking simply ends.</p>
      <h2>If you cancel after paying</h2>
      <div className="table-wrap card"><table className="table"><thead><tr><th>When</th><th>What you get back</th></tr></thead><tbody>
        <tr><td>Within 24 hours of paying (and before the creative deadline)</td><td>Everything you paid, less the card processing cost of the refund.</td></tr>
        <tr><td>After 24 hours, before the creative deadline</td><td>What you paid, less a 15% cancellation fee kept by the publisher (plus VAT on it, where applicable), less the card processing cost of the refund.</td></tr>
        <tr><td>After the creative deadline</td><td>No refund: the publisher has reserved the slot for you.</td></tr>
      </tbody></table></div>
      <h2>If the publisher cancels or the ad does not run</h2>
      <p>You get a full refund of what you paid. If the ad ran in the wrong place or time, the publisher may offer a make-good (a replacement run); you can accept it or ask Nashr to decide.</p>
      <h2>If the proof is wrong</h2>
      <p>Report an issue within 5 working days of receiving the proof. Release of the money pauses. The publisher can respond, offer a make-good, or agree to a partial or full refund. If you do not agree, Nashr reviews the evidence on both sides and decides. Nashr's decision decides whether the held money is released, refunded in part, or refunded in full.</p>
      <h2>How refunds are paid</h2>
      <p>Refunds go back to the card or account you paid with, in the currency you paid. Banks usually show them within 5 to 10 working days. A credit note is issued for every refund.</p>
      <h2>Chargebacks</h2>
      <p>Please contact Nashr before disputing a payment with your bank, so we can resolve it quickly. Nashr may suspend an account that files a chargeback for an ad that ran as booked.</p>
      <h2>Contact</h2>
      <p>{CONTACT}</p>
    </Page>
  )
}
