import { useEffect, useRef, useState } from 'react'
import './landing.css'
import { FAQ, PAGES, faqLd, useMeta } from './seo'
import { isAr, t } from './i18n'
import { money } from './format'
import { api } from './api'
import { AUDIENCES } from '../../server/shared/audiences'
import { INDUSTRY_PAGES } from './public/industries'
import { CHANNEL_NAME, ICON } from './media'

/**
 * The home page, as the owner drew it: a deep violet hero ("Media moves differently here."), proof in Nashr's own live
 * numbers, every format, a moving row of the outlets you can book, how a booking works with the money held, and Athena
 * as a teaser. Figures are real or plainly marked as examples; client results wait until there are verified ones.
 */
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
const FORMATS = ['digital', 'newspaper', 'magazine', 'newsletter', 'radio', 'tv', 'podcast', 'social']

type Outlet = { id: string; slug: string; name: string; channel: string; logoUrl: string | null; comingSoon: boolean; onNashr: boolean
  price: { label: string; from: number | null; to: number | null } | null }

export function Landing() {
  const steps = useRef<HTMLOListElement>(null)
  useMeta({ ...PAGES['/'], path: '/', jsonLd: [faqLd()] })

  useEffect(() => {
    // The five steps light up in order once, when they come into view (fully readable before that).
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const items = [...(steps.current?.children ?? [])] as HTMLElement[]
    const fill = () => items.forEach((li, k) => setTimeout(() => li.classList.add('on'), reduce ? 0 : k * 320))
    let io: IntersectionObserver | undefined
    if ('IntersectionObserver' in window && !reduce && steps.current) {
      io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { fill(); io!.disconnect() } }, { threshold: .35 })
      io.observe(steps.current)
    } else fill()
    return () => io?.disconnect()
  }, [])

  return (
    <div className="lp">
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="kicker"><span className="live-dot" aria-hidden />{t("Live in the UAE. Saudi Arabia next.")}</p>
            <h1>{t("Media moves differently here.")}</h1>
            {!isAr && <p className="ar" lang="ar" dir="rtl">الإعلام يتحرك هنا بطريقة مختلفة</p>}
            <p className="lede">{t("Buy and sell premium media across the UAE in one marketplace: websites, newspapers, magazines, newsletters, radio, TV, podcasts and social. The money is held until the ad has run.")}</p>
            <div className="cta-row">
              <a className="btn signal" href="/request-access">{t("Get early access")}</a>
              <a className="btn ghost" href="/calendar">{t("Browse the calendar")}</a>
            </div>
            <p className="fine">{t("Every slot and price is open to browse. Sign in when you're ready to bid.")} <button type="button" className="text-link" onClick={() => go('how')}>{t("How it works")}</button></p>
          </div>

          <figure className="deal-stack" aria-label={t("Example booking")}>
            <div className="ticket">
              <div className="ticket-h"><span className="ticket-logo" aria-hidden>SF</span><div><b>Skyline FM</b><span>{t("Drive Home, Break 2 · 17:15")}</span></div>
                <span className="chip ok">{t("Bid accepted")}</span></div>
              <div className="ticket-amt"><span>{t("Winning bid")}</span><b className="num">{money(600_000)}</b></div>
              <ol className="ticket-steps" aria-label={t("Where this booking is")}>
                <li className="done">{t("Bid")}</li><li className="done">{t("Accepted")}</li><li className="now">{t("Paid, held")}</li><li>{t("On air")}</li><li>{t("Released")}</li>
              </ol>
            </div>
            <div className="ticket small held"><span className="held-ic" aria-hidden>✓</span><div><b>{t("Held until proof")}</b><span>{t("The publisher is paid when you approve the as-run log.")}</span></div></div>
            <div className="ticket small athena"><span className="spark" aria-hidden /><div><b>{t("Athena")}</b><span>{t("Your media co-pilot, launching soon")}</span></div></div>
            <figcaption>{t("Example booking")}</figcaption>
          </figure>
        </div>
      </section>

      <Proof />
      <Outlets />

      <section className="block how" id="how">
        <div className="wrap">
          <h2>{t("From bid to broadcast, with the money held in between.")}</h2>
          <p className="intro">{t("Every booking follows the same five steps, with a clock on each one so nobody is left waiting.")}</p>
          <ol className="steps" ref={steps}>
            <li><h3>{t("Bid or request")}</h3><p>{t("Bid in 3% steps, set an auto-bid limit, or ask for the buy-now price. Nothing is charged.")}</p></li>
            <li><h3>{t("Publisher accepts")}</h3><p>{t("The publisher sees your brief and decides within 24 hours.")}</p></li>
            <li className="pay"><h3>{t("Pay, money held")}</h3><p>{t("Pay within 48 hours. The money waits with Nashr, not the publisher.")}</p></li>
            <li><h3>{t("Ad runs, proof sent")}</h3><p>{t("The publisher sends proof: the as-run log, the tearsheet, the screenshots.")}</p></li>
            <li className="pay"><h3>{t("Approve, money released")}</h3><p>{t("Approve and the publisher is paid, or it releases itself after 5 working days.")}</p></li>
          </ol>
        </div>
      </section>

      <section className="block sides">
        <div className="wrap split">
          <article className="aud" id="advertisers">
            <img className="aud-photo" src="/brand/buyers.jpg" width={960} height={540} alt={t("A planning team mapping a campaign on a glass wall")} loading="lazy" decoding="async" />
            <h3>{t("For brands and agencies")}</h3>
            <p className="aud-lede">{t("Every UAE outlet on one calendar.")}</p>
            <ul>
              <li>{t("Browse slots by day, week or month, in Dubai time, with prices excluding VAT.")}</li>
              <li>{t("Plan campaigns against a budget, with committed and remaining spend.")}</li>
              <li>{t("Upload creative, approve proof and download the publisher's tax invoice in one place.")}</li>
            </ul>
            <a className="btn" href="/calendar">{t("Browse the calendar")}</a>
          </article>
          <article className="aud pub" id="publishers">
            <img className="aud-photo" src="/brand/publishers.jpg" width={960} height={540} alt={t("Broadcast camera operators filming a live programme")} loading="lazy" decoding="async" />
            <h3>{t("For publishers")}</h3>
            <p className="aud-lede">{t("Sell your inventory to serious buyers.")}</p>
            <ul>
              <li>{t("Add each product once, then put dates on sale from your calendar at the price you choose.")}</li>
              <li>{t("Accept, counter or decline each request with the buyer, the brief and what you receive in view.")}</li>
              <li>{t("Tax invoices in your name and TRN, and a monthly payout statement.")}</li>
            </ul>
            <a className="btn" href="/request-access">{t("List your outlet")}</a>
          </article>
        </div>
      </section>

      <section className="block money">
        <div className="wrap held-section">
          <div>
            <h2>{t("Nobody is paid until the ad has run.")}</h2>
            <p className="intro">{t("The buyer pays Nashr, Nashr holds it, and the publisher is paid when the proof is approved. If the ad doesn't run, the buyer is refunded. VAT and fees are shown before anyone commits.")}</p>
          </div>
          <div className="ledger-card" aria-label={t("Example booking: AED 5,500 radio break")}>
            <div className="ledger-top"><span>{t("Example: one radio break")}</span><span className="pill held-pill">{t("Held until proof")}</span></div>
            <table className="ledger"><tbody>
              <tr><td>{t("Break price")}</td><td>{t("AED 5,500")}</td></tr>
              <tr><td>{t("VAT, charged by the publisher (5%)")}</td><td>{t("AED 275")}</td></tr>
              <tr className="sub"><td>{t("Buyer pays")}</td><td>{t("AED 5,775")}</td></tr>
              <tr><td>{t("Nashr commission (example, 12%)")}</td><td>{t("−AED 660")}</td></tr>
              <tr className="total"><td>{t("Publisher receives on approval")}</td><td>{t("AED 5,115")}</td></tr>
            </tbody></table>
            <p className="note">{t("Example figures. The commission rate is agreed with each publisher.")}</p>
          </div>
        </div>
      </section>

      <section className="block reach">
        <div className="wrap">
          <h2>{t('Start from who you want to reach.')}</h2>
          <p className="intro">{t('Pick an audience and see every slot that reaches it, on every channel, from every publisher.')}</p>
          <ul className="reach-aud">{AUDIENCES.slice(0, 8).map(([k, label]) => <li key={k}><a href={`/audiences/${k}`}>{t(label)}</a></li>)}
            <li><a className="more" href="/audiences">{t('All audiences')}</a></li></ul>
          <p className="reach-ind"><span className="muted">{t('Or by industry:')}</span>{INDUSTRY_PAGES.map(([k, , label]) => <a key={k} href={`/advertise/${k}`}>{t(label)}</a>)}</p>
        </div>
      </section>

      <section className="athena" id="athena">
        <div className="wrap athena-grid">
          <div>
            <p className="soon-tag">{t("Launching soon")}</p>
            <h2>{t("Meet Athena, your media co-pilot.")}</h2>
            <p className="intro">{t("Ask in plain language and Athena suggests where your budget works hardest, compares outlets and drafts the plan for you to book.")}</p>
            <a className="btn signal" href="/request-access">{t("Join the waitlist")}</a>
          </div>
          <div className="chat" aria-label={t("Athena preview")}>
            <div className="chat-h"><span className="spark" aria-hidden /><b>{t("Athena")}</b><span>{t("Preview")}</span></div>
            <p className="msg me">{t("How should I spend AED 80,000 on a January launch for young professionals in Dubai?")}</p>
            <p className="msg ai">{t("Weekday drive-time radio and two business newsletters reach them best for that budget. I'd keep a fifth for a podcast read in week two.")}</p>
            <div className="chat-acts" aria-hidden><span>{t("Show me the plan")}</span><span>{t("Compare outlets")}</span></div>
          </div>
        </div>
      </section>

      <section className="block faq" id="faq">
        <div className="wrap faq-grid">
          <div className="faq-side"><h2>{t("Questions buyers and publishers ask")}</h2>
            <p className="intro">{t("Anything else? Ask us from the help page once you're in.")}</p></div>
          <div className="faq-list">{FAQ.map(([q, a]) => <details key={q}><summary>{t(q)}</summary><p>{t(a)}</p></details>)}</div>
        </div>
      </section>

      <section className="closing">
        <div className="wrap closing-grid">
          <div>
            <h2>{t("Ready when your next campaign is.")}</h2>
            <p>{t("Nashr is invite-only for UAE brands, agencies and media outlets. Our team reviews every request and sends an invite to your work email.")}</p>
            <div className="cta-row"><a className="btn signal" href="/request-access">{t("Get early access")}</a><a className="btn ghost" href="/sign-in">{t("Sign in")}</a></div>
          </div>
          <div className="closing-mark" lang="ar" aria-hidden>نشر</div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="wrap foot-grid">
          <div className="foot-brand"><span className="mark"><b>Nashr</b><i lang="ar">نشر</i></span><p>{t("The UAE media marketplace. Prices in AED, times in Dubai time.")}</p></div>
          <nav aria-label={t("Product")}><b>{t("Product")}</b><a href="/calendar">{t("Calendar")}</a><a href="/directory">{t("Directory")}</a><a href="/audiences">{t('Audiences')}</a><a href="/insights">{t('Insights')}</a><button type="button" className="text-link" onClick={() => go('how')}>{t("How it works")}</button></nav>
          <nav aria-label={t("Account")}><b>{t("Account")}</b><a href="/request-access">{t("Request access")}</a><a href="/sign-in">{t("Sign in")}</a></nav>
          <nav aria-label={t("Legal")}><b>{t("Legal")}</b><a href="/terms">{t("Terms")}</a><a href="/privacy">{t("Privacy")}</a><a href="/refunds">{t("Refunds")}</a></nav>
        </div>
        <div className="wrap foot-base"><span>© {new Date().getFullYear()} Nashr</span><span>{t("Made for the UAE media market")}</span></div>
      </footer>
    </div>
  )
}

type Stats = { publishers: number | null; outlets: number | null; channels: number | null; openSlots: number | null; completed: number | null; booked: number | null }

/** Proof in Nashr's own live numbers, each shown only once it is big enough to mean something; beside them, every format. */
function Proof() {
  const [s, setS] = useState<Stats | null>(null)
  useEffect(() => { api<Stats>('/public/stats').then(setS, () => {}) }, [])
  const items = (s ? [
    [s.booked != null ? money(s.booked).replace(/\.00$/, '') : null, t('booked through Nashr'), t('Held until each ad ran.')],
    [s.openSlots, t('slots open to book'), t('In the next 30 days, with prices to read.')],
    [s.publishers, t('verified UAE publishers'), t('Newspapers, broadcasters and digital-first brands.')],
    [s.completed, t('bookings completed'), t('Each one paid only after proof.')],
  ] : []).filter(([v]) => v != null).slice(0, 3) as [number | string, string, string][]
  return <section className="proof" aria-label={t('Nashr in numbers')}>
    <div className="wrap proof-grid">
      {items.map(([v, l, sub]) => <div className="proof-card" key={l}><b className="num">{typeof v === 'number' ? v.toLocaleString('en-US') : v}</b><span className="l">{l}</span><span className="s">{sub}</span></div>)}
      <div className="proof-card formats"><b>{t('Every format')}</b><span className="s">{t('Bought and sold in one place.')}</span>
        <ul>{FORMATS.map(f => <li key={f}>{CHANNEL_NAME[f]}</li>)}</ul></div>
    </div>
  </section>
}

/** The outlets you can book, from the live directory, drifting past in a row (still for people who prefer less motion). */
function Outlets() {
  const [list, setList] = useState<Outlet[]>([])
  useEffect(() => { api<Outlet[]>('/directory').then(r => setList(r.filter(o => o.onNashr && !o.comingSoon)), () => {}) }, [])
  if (list.length < 3) return null
  const card = (o: Outlet, copy = false) => <a className="ol-card" href={`/directory/${o.slug}`} key={`${copy ? 'b' : 'a'}-${o.id}`} tabIndex={copy ? -1 : undefined}>
    {o.logoUrl ? <img src={o.logoUrl} alt="" width={48} height={48} loading="lazy" decoding="async" />
      : <span className="ol-ic" aria-hidden><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[o.channel] ?? ICON.digital} /></svg></span>}
    <span className="ol-t"><b>{o.name}</b><span>{CHANNEL_NAME[o.channel] ?? o.channel}</span>
      {o.price?.from != null && <span className="from">{t('from {amount}', { amount: money(o.price.from).replace(/\.00$/, '') })}</span>}</span></a>
  return <section className="block outlets" aria-labelledby="outlets-h">
    <div className="wrap outlets-head">
      <div><h2 id="outlets-h">{t('Outlets you can book today')}</h2>
        <p className="intro">{t('Radio and TV stations, newspapers, magazines and digital brands across the UAE. Prices are indicative until each publisher confirms its rate card.')}</p></div>
      <a className="btn" href="/directory">{t('Browse the directory')}</a>
    </div>
    <div className="marquee">
      <div className="marquee-track">{list.map(o => card(o))}</div>
      <div className="marquee-track" aria-hidden>{list.map(o => card(o, true))}</div>
    </div>
  </section>
}
