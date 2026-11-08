import { PAGES, breadcrumb, useMeta } from './seo'
import { useEffect, useState } from 'react'
import { PhotoBand } from './PhotoBand'
import { api } from './api'

/*
 * Terms, privacy and refund policy. DRAFTS written from how Nashr actually works (the timers and fees are the
 * defaults in the settings table); a UAE lawyer must review them before real money moves. Bracketed blanks are for the owner.
 */
const UPDATED = '9 November 2026' // keep in step with the terms_version setting: changing the terms asks everyone to accept again
const ENTITY = '[Nashr legal entity name]', LICENCE = '[trade licence number and issuing authority]', ADDRESS = '[registered address, UAE]', CONTACT = '[support email]'

const PHOTO: Record<string, string> = { '/terms': '/brand/print-wide.jpg', '/privacy': '/brand/desk-wide.jpg', '/refunds': '/brand/campaigns-wide.jpg', '/dispute-policy': '/brand/bookings-wide.jpg' }

function Page({ title, path, children }: { title: string; path: string; children: React.ReactNode }) {
  useMeta({ ...PAGES[path], jsonLd: [breadcrumb([['Nashr', '/'], [title, path]])] }, [path])
  return (
    <main className="legal">
      <PhotoBand img={PHOTO[path] ?? '/brand/print-wide.jpg'} title={title} sub={`Last updated ${UPDATED}`} focus={path === '/privacy' ? '60% 18%' : undefined} />
      <p className="warn" role="note"><b>Draft for legal review.</b> This text describes how Nashr works today. It is not final until approved by a UAE lawyer.</p>
      {children}
      <nav className="legal-links small" aria-label="Legal"><a href="/terms">Terms of use</a><a href="/dispute-policy">Disputes and payment protection</a><a href="/refunds">Refunds and cancellations</a><a href="/privacy">Privacy policy</a></nav>
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
      <h2>8. Issues, disputes and payment protection</h2>
      <ul>
        <li>Every payment is held by Nashr from the moment the buyer pays until the ad has run and the buyer approves the proof, or the review window ends without an issue. Neither the publisher nor Nashr can use held money.</li>
        <li>If something went wrong, the buyer reports an issue within the review window. Release stops at once and stays stopped until the issue is resolved.</li>
        <li>The publisher answers first: corrected proof, a make-good (the ad runs again), or a partial or full refund. If the buyer does not accept, or the publisher does not answer in time, Nashr decides on the evidence from both sides, within the time stated in the <a href="/dispute-policy">Disputes and payment protection policy</a>.</li>
        <li>Nashr's decision decides where the held money goes, and is carried out at once. It does not take away any legal right either side has.</li>
        <li>Cancellations and refunds follow the <a href="/refunds">Refunds and cancellations policy</a>.</li>
      </ul>
      <h2>9. How you use Nashr</h2>
      <ul>
        <li>Give true information about your company, your inventory and your bookings, and keep it up to date.</li>
        <li>Do not share contact details to arrange a booking outside Nashr, and do not take a booking found on Nashr outside it. [Owner to decide: a period, for example 12 months, during which Nashr may charge its commission on such a booking.]</li>
        <li>Do not post anything unlawful, misleading, or that infringes someone else's rights; do not try to reach data or accounts that are not yours; do not interfere with how Nashr works.</li>
        <li>Business profiles, prices and booking details you see about other users are for deciding and carrying out bookings on Nashr only.</li>
      </ul>
      <h2>10. Account security and help from Nashr</h2>
      <ul>
        <li>Use a strong password, and two-step sign-in where Nashr asks for it (for example before paying, or before connecting where payouts go).</li>
        <li>To help you, Nashr's team may view your account, or sign in as you for up to one hour, always with a written reason. You are told on your notifications, and every page viewed and every change made is recorded under the staff member's name. Staff cannot change your password, pay with your card or change where your payouts go.</li>
      </ul>
      <h2>11. Content, rights and responsibility</h2>
      <ul>
        <li>The buyer owns or is licensed to use the creative it sends, and gives the publisher the right to run it for the booking. The buyer is responsible for the ad's content and its compliance with advertising law, including any required disclaimer.</li>
        <li>The publisher is responsible for running the ad as booked and for the truth of its proof.</li>
        <li>Each side is responsible to the other for claims that arise from its own breach of these terms.</li>
      </ul>
      <h2>12. Suspension and closing an account</h2>
      <p>Nashr may suspend or close an account that breaks these terms, risks harm to other users, or must be suspended by law. Bookings already paid are completed or refunded under these terms and the policies above. You may close your account by contacting Nashr once no booking is open.</p>
      <h2>13. Events outside anyone's control</h2>
      <p>If an ad cannot run because of events outside the publisher's reasonable control (for example an official broadcast interruption or a ban), the buyer is refunded in full or offered a make-good, and neither side is liable for the delay.</p>
      <h2>14. Liability</h2>
      <p>To the extent the law allows, Nashr is not liable for indirect or consequential loss, or for the content of ads. Nashr's total liability for a booking is limited to the amount Nashr holds or received for that booking. Nothing in these terms limits liability that cannot be limited by law.</p>
      <h2>15. Notices and changes</h2>
      <p>Nashr gives notices in the app and, once email is connected, by email. We may update these terms; each version has a date. When they change, you are asked to read and accept the new version before you carry on. Changes do not affect bookings already accepted.</p>
      <h2>16. Law</h2>
      <p>These terms are governed by the laws of the United Arab Emirates as applied in [Emirate]. Disputes go to the courts of [Emirate / free zone courts], unless the law says otherwise.</p>
      <h2>17. Contact</h2>
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
        <li><b>Security and logs:</b> sign-ins (successful and failed) with time, IP address and browser, active sessions, which version of the terms you accepted and when, and a record of important actions (the audit log).</li>
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
        <li>Nashr's team, when helping you or deciding a dispute: they may view your account or sign in as you for up to one hour, with a written reason you are told about. Every page viewed and every change is recorded.</li>
        <li>In a dispute, the other side of that booking sees the statements and files each side adds to the case.</li>
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

type Rules = { review_working_days: number; issue_response_hours: number; dispute_decision_working_days: number; proof_due_working_days: number }
const DEFAULT_RULES: Rules = { review_working_days: 5, issue_response_hours: 48, dispute_decision_working_days: 5, proof_due_working_days: 2 }

/** How an issue between a buyer and a publisher is resolved, step by step, with the deadlines in force now. */
export function DisputesPolicyPage() {
  const [r, setR] = useState<Rules>(DEFAULT_RULES)
  useEffect(() => { api<Rules>('/help/rules').then(x => setR({ ...DEFAULT_RULES, ...x }), () => {}) }, [])
  return (
    <Page title="Disputes and payment protection" path="/dispute-policy">
      <p>Every booking on Nashr is protected the same way: the buyer's money is held by Nashr and is not paid to the publisher until the ad has run as booked. If the two sides disagree, there is one process, with deadlines, open evidence on both sides, and a decision by Nashr.</p>

      <h2>1. How the payment is protected</h2>
      <ul>
        <li>The money is held from the moment the buyer pays. It is recorded against the booking and is not available to the publisher, or to Nashr, while it is held.</li>
        <li>It is released only in one of four ways: the buyer approves the proof; the review window of {r.review_working_days} working days ends without an issue; the two sides agree a resolution on Nashr; or Nashr decides a dispute.</li>
        <li>While an issue is open, nothing is released, and any payout for that booking waits.</li>
      </ul>

      <h2>2. What counts as an issue</h2>
      <ul>
        <li>The ad did not run.</li>
        <li>It ran on the wrong date or at the wrong time, or in the wrong position or placement.</li>
        <li>The creative was changed, cut or shown in poor quality (for example broken audio, a misprint).</li>
        <li>Anything else that departs materially from the booking as agreed.</li>
      </ul>
      <p>These are not issues: a change of mind, campaign results, the buyer's own late or wrong creative, or anything outside the booked placement.</p>

      <h2>3. Step by step</h2>
      <ol>
        <li><b>The buyer reports the issue</b> from the booking, within {r.review_working_days} working days of receiving the proof: what went wrong, a short description, and any evidence. Release stops at once.</li>
        <li><b>The publisher answers within {r.issue_response_hours} hours</b> with corrected proof, a make-good on a stated date, or a partial or full refund. If it does not answer in time, the issue goes straight to Nashr.</li>
        <li><b>The buyer has {r.issue_response_hours} hours</b> to accept the answer, which settles the issue at once, or to decline it. Declining, or not answering, sends it to Nashr.</li>
        <li><b>Nashr decides within {r.dispute_decision_working_days} working days.</b> Both sides are told the decision date. Until then each side can add its statement and files (up to five statements each), and each sees what the other sends.</li>
        <li><b>The decision is carried out at once,</b> and both sides receive it with the written reason.</li>
      </ol>

      <h2>4. Evidence that helps</h2>
      <ul>
        <li><b>Publishers:</b> as-run or broadcast logs, recordings with time stamps, tear sheets, screenshots showing the date, delivery reports.</li>
        <li><b>Buyers:</b> recordings, photos, monitoring reports, screenshots, and how the result differs from the booking.</li>
      </ul>
      <p>Keep the conversation on Nashr. Statements may not contain email addresses or phone numbers.</p>

      <h2>5. How Nashr decides</h2>
      <p>Nashr compares what was delivered with the booking as agreed: the placement, the date and time, the brief and the proof checklist for the channel. It weighs the evidence from both sides and decides what is more likely than not. Decisions are made by Nashr staff with no interest in either side, and every step is recorded.</p>

      <h2>6. Possible outcomes</h2>
      <div className="table-wrap card"><table className="table"><thead><tr><th>Outcome</th><th>When</th><th>What happens to the money</th></tr></thead><tbody>
        <tr><td>Release in full</td><td>The ad ran as booked.</td><td>Paid to the publisher, less Nashr's commission.</td></tr>
        <tr><td>Make-good</td><td>The ad ran but not as booked, and a rerun puts it right.</td><td>Stays held until proof of the rerun, then released.</td></tr>
        <tr><td>Partial refund</td><td>The ad ran with a real shortfall.</td><td>The stated amount goes back to the buyer; the rest to the publisher.</td></tr>
        <tr><td>Full refund</td><td>The ad did not run, or was not delivered as booked in any useful way.</td><td>Everything paid goes back to the buyer.</td></tr>
      </tbody></table></div>
      <p>When a refund is the publisher's fault, the card processing cost of the refund is deducted from the publisher's next payout; the buyer does not pay it.</p>

      <h2>7. Bank disputes (chargebacks)</h2>
      <p>Please use this process before asking your bank to reverse a payment. If a chargeback is opened, the bank decides: Nashr provides the booking record and evidence, and cannot refund or release that payment until the bank's decision. An account that files a chargeback for an ad that ran as booked may be suspended.</p>

      <h2>8. Records, mistakes and your rights</h2>
      <ul>
        <li>Nashr keeps the booking, the proof, both sides' statements and files, and the decision, for at least five years.</li>
        <li>If a decision was based on a clear mistake of fact, tell Nashr within 10 working days; it will look again and tell both sides.</li>
        <li>Nashr's decision decides where the held money goes. It does not take away any legal right either side has under the <a href="/terms">terms of use</a> and UAE law.</li>
      </ul>
    </Page>
  )
}

