import { useEffect, useRef, useState } from 'react'
import './landing.css'
import { FAQ, PAGES, faqLd, useMeta } from './seo'

/**
 * The first page visitors see. One bold element — the live programme board in the control room — and everything
 * around it quiet. Everything past this page can be browsed without an account; signing in is only needed to act.
 * In-page links scroll instead of changing the address.
 */
const STEPS = [3500, 3605, 3714, 3826, 3941]
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

const LANES = [
  { who: 'Skyline FM', kind: 'Radio', slots: [{ l: 4, w: 22, t: 'Morning Markets', s: '4 breaks', c: 'hot' }, { l: 72, w: 20, t: 'Drive Home', s: 'quick sale' }] },
  { who: 'Dubai One', kind: 'TV', slots: [{ l: 33, w: 16, t: 'Market Open', s: 'booked', c: 'booked' }, { l: 78, w: 18, t: 'Evening', s: '2 spots' }] },
  { who: 'Gulf News', kind: 'Print', slots: [{ l: 1, w: 97, t: 'Full page, business section', s: 'all day, from AED 20,000' }] },
  { who: 'The Majlis', kind: 'Podcast', slots: [{ l: 2, w: 28, t: 'Weekly episode', s: 'pre-roll and mid-roll' }] },
]

const CHANNELS = [
  { k: 'radio', name: 'Radio', line: 'Single breaks, any break, packages' },
  { k: 'tv', name: 'TV', line: 'Spots by programme and time' },
  { k: 'print', name: 'Print', line: 'Pages by edition and section' },
  { k: 'digital', name: 'Digital', line: 'Homepage takeovers by day' },
  { k: 'podcast', name: 'Podcasts', line: 'Pre-roll, mid-roll, post-roll' },
]

export function Landing() {
  const head = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null), steps = useRef<HTMLOListElement>(null)
  const [i, setI] = useState(2), [hours, setHours] = useState(6)
  useMeta({ ...PAGES['/'], path: '/', jsonLd: [faqLd()] })

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    // The one orchestrated moment: the playhead sweeps the board and the top bid climbs in 3% steps.
    let raf = 0, timer = 0
    if (!reduce) {
      timer = window.setInterval(() => {
        setI(n => (n + 1) % STEPS.length); setHours(h => (h <= 1 ? 6 : h - 1))
        const c = card.current; if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash') }
      }, 2600)
      const t0 = performance.now()
      const sweep = (t: number) => {
        const p = ((t - t0) / 14000) % 1
        if (head.current) head.current.style.left = `calc(var(--gut) + (100% - var(--gut)) * ${(0.04 + p * 0.92).toFixed(4)})`
        raf = requestAnimationFrame(sweep)
      }
      raf = requestAnimationFrame(sweep)
    }
    // The five steps light up in order once, when they come into view (fully readable before that).
    const items = [...(steps.current?.children ?? [])] as HTMLElement[]
    const fill = () => items.forEach((li, k) => setTimeout(() => li.classList.add('on'), reduce ? 0 : k * 320))
    let io: IntersectionObserver | undefined
    if ('IntersectionObserver' in window && !reduce && steps.current) {
      io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { fill(); io!.disconnect() } }, { threshold: .35 })
      io.observe(steps.current)
    } else fill()
    return () => { cancelAnimationFrame(raf); clearInterval(timer); io?.disconnect() }
  }, [])

  return (
    <div className="lp">
      <section className="hero">
        <div className="hero-bg" aria-hidden><span className="glow g1" /><span className="glow g2" /><span className="grid-lines" /><span className="grain" /></div>
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="kicker"><span className="live-dot" aria-hidden />Live in the UAE. Saudi Arabia next.</p>
            <h1>Book UAE airtime and pages in one place.</h1>
            <p className="ar" lang="ar" dir="rtl">احجز إعلانك في الإذاعة والتلفزيون والصحف والمنصات الرقمية من مكان واحد</p>
            <p className="lede">Bid on radio breaks, TV spots, print pages, homepage takeovers and podcast reads, directly from the publishers. Your payment is held until the publisher proves the ad ran.</p>
            <div className="cta-row">
              <a className="btn signal" href="/calendar">Browse the calendar</a>
              <a className="btn ghost" href="/request-access">Request access</a>
            </div>
            <p className="fine">Every slot and price is open to browse. Sign in when you're ready to bid. <button type="button" className="text-link" onClick={() => go('how')}>How it works</button></p>
          </div>

          <a className="board" href="/calendar" aria-label="Example programme board. Open the live calendar">
            <div className="board-h"><span><b>Mon 16 Nov</b> Dubai time</span><span className="live">Bidding live</span></div>
            <div className="board-body">
              <div className="axis" aria-hidden><span /><div className="ticks"><span>06:00</span><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span></div></div>
              <div className="lanes" aria-hidden>
                {LANES.map(l => <div className="lane" key={l.who}><div className="who">{l.who}<small>{l.kind}</small></div><div className="track">
                  {l.slots.map(s => <div key={s.t} className={`slot ${s.c ?? ''}`} style={{ left: `${s.l}%`, width: `${s.w}%` }}><b>{s.t}</b>{s.s}</div>)}</div></div>)}
                <div className="playhead" ref={head} />
              </div>
            </div>
            <div className="bidcard" ref={card}>
              <div><span className="t">Skyline FM, Break 2 at 07:15</span><span className="amt">AED {STEPS[i].toLocaleString('en-US')}</span><span className="t">Top bid, 3% steps</span></div>
              <div className="state"><span className="pill soon">Closes in {hours}h</span>{i % 2 === 0 && <span className="pill lead">You lead</span>}</div>
            </div>
          </a>
        </div>

        <ul className="wrap channels" aria-label="What you can book">
          {CHANNELS.map(c => <li key={c.k}>
            <img src={`/brand/${c.k}.jpg`} width={640} height={800} alt="" loading="lazy" decoding="async" />
            <div><b>{c.name}</b><span>{c.line}</span></div>
          </li>)}
        </ul>
      </section>

      <section className="product">
        <div className="wrap">
          <div className="product-head">
            <h2>Your media plan, money and proof on one desk.</h2>
            <p>See what you've committed, what's held and what needs you today. Publishers see their sales, buyers and payouts the same way.</p>
          </div>
          <figure className="frame">
            <div className="frame-bar" aria-hidden><i /><i /><i /><span>nashr.restbits.online/dashboard</span></div>
            <img src="/product/dashboard.jpg" width={1360} height={560} alt="The buyer dashboard: money held, weekly spend, payments due and live bids" loading="lazy" decoding="async" />
          </figure>
        </div>
      </section>

      <section className="block">
        <div className="wrap bento">
          <article className="tile t-cal">
            <h3>Every slot, in Dubai time</h3>
            <p>Radio breaks, TV spots, pages and takeovers by day, week or month, with the price and what's left.</p>
            <div className="mini-cal" aria-hidden>{Array.from({ length: 21 }, (_, k) => <span key={k} className={[2, 5, 6, 9, 12, 13, 16].includes(k) ? 'on' : k === 10 ? 'now' : ''} />)}</div>
          </article>
          <article className="tile t-price">
            <h3>Prices you can read</h3>
            <p>Every price says where it comes from, so you know what's typical before you bid.</p>
            <ul className="labels" aria-label="Price labels">
              <li><b>AED 15,000–18,000</b><span className="lab typical">Typical on Nashr</span></li>
              <li><b>AED 9,000</b><span className="lab rate">Publisher's rate</span></li>
              <li><b>AED 18,000–26,000</b><span className="lab est">Estimate, unconfirmed</span></li>
            </ul>
          </article>
          <article className="tile t-held">
            <h3>Paid only after proof</h3>
            <p>The publisher is paid when you approve the as-run log, tearsheet or screenshots.</p>
            <div className="held-flow" aria-hidden><span>Buyer</span><i /><span className="held">Held</span><i /><span>Publisher</span></div>
          </article>
          <article className="tile t-thread">
            <h3>Brief, creative and proof in one place</h3>
            <p>No email chains. Every booking keeps its own record, from the first bid to the tax invoice.</p>
            <ol className="thread" aria-label="Example booking record">
              <li className="done">Brief sent with the bid</li><li className="done">Creative approved</li><li className="done">Proof received</li><li>Approve and release</li>
            </ol>
          </article>
        </div>
      </section>

      <section className="block how" id="how">
        <div className="wrap">
          <h2>From bid to broadcast, with the money held in between.</h2>
          <p className="intro">Every booking follows the same five steps, with a clock on each one so nobody is left waiting.</p>
          <ol className="steps" ref={steps}>
            <li><h3>Bid or request</h3><p>Bid in 3% steps, set an auto-bid limit, or ask for the buy-now price. Nothing is charged.</p></li>
            <li><h3>Publisher accepts</h3><p>The publisher sees your brief and decides within 24 hours.</p></li>
            <li className="pay"><h3>Pay, money held</h3><p>Pay within 48 hours. The money waits with Nashr, not the publisher.</p></li>
            <li><h3>Ad runs, proof sent</h3><p>The publisher sends proof: the as-run log, the tearsheet, the screenshots.</p></li>
            <li className="pay"><h3>Approve, money released</h3><p>Approve and the publisher is paid, or it releases itself after 5 working days.</p></li>
          </ol>
        </div>
      </section>

      <section className="block sides">
        <div className="wrap split">
          <article className="aud">
            <h3>For brands and agencies</h3>
            <p className="aud-lede">Every UAE outlet on one calendar.</p>
            <ul>
              <li>Browse slots by day, week or month, in Dubai time, with prices excluding VAT.</li>
              <li>Plan campaigns against a budget, with committed and remaining spend.</li>
              <li>Upload creative, approve proof and download the publisher's tax invoice in one place.</li>
            </ul>
            <a className="btn" href="/calendar">Browse the calendar</a>
          </article>
          <article className="aud pub">
            <h3>For radio, TV, print, digital and podcasts</h3>
            <p className="aud-lede">Sell your inventory to serious buyers.</p>
            <ul>
              <li>List programmes with their breaks, set a reserve, a buy-now price and a package price.</li>
              <li>Decide with the full picture: the buyer, the brief and exactly what you receive.</li>
              <li>Tax invoices in your name and TRN, and a monthly payout statement.</li>
            </ul>
            <a className="btn" href="/request-access">List your outlet</a>
          </article>
        </div>
      </section>

      <section className="block money">
        <div className="wrap held-section">
          <div>
            <h2>Nobody is paid until the ad has run.</h2>
            <p className="intro">The buyer pays Nashr, Nashr holds it, and the publisher is paid when the proof is approved. If the ad doesn't run, the buyer is refunded. VAT and fees are shown before anyone commits.</p>
          </div>
          <div className="ledger-card" aria-label="Example booking: AED 5,500 radio break">
            <div className="ledger-top"><span>Example: one radio break</span><span className="pill held-pill">Held until proof</span></div>
            <table className="ledger"><tbody>
              <tr><td>Break price</td><td>AED 5,500</td></tr>
              <tr><td>VAT, charged by the publisher (5%)</td><td>AED 275</td></tr>
              <tr className="sub"><td>Buyer pays</td><td>AED 5,775</td></tr>
              <tr><td>Nashr commission (example, 12%)</td><td>−AED 660</td></tr>
              <tr className="total"><td>Publisher receives on approval</td><td>AED 5,115</td></tr>
            </tbody></table>
            <p className="note">Example figures. The commission rate is agreed with each publisher.</p>
          </div>
        </div>
      </section>

      <section className="block faq" id="faq">
        <div className="wrap faq-grid">
          <h2>Questions buyers and publishers ask</h2>
          <div className="faq-list">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="closing">
        <div className="hero-bg" aria-hidden><span className="glow g2" /><span className="grid-lines" /><span className="grain" /></div>
        <div className="wrap closing-grid">
          <div>
            <h2>Ready when your next campaign is.</h2>
            <p>Nashr is invite-only for UAE brands, agencies and media outlets. Our team reviews every request and sends an invite to your work email.</p>
            <div className="cta-row"><a className="btn signal" href="/request-access">Request access</a><a className="btn ghost" href="/sign-in">Sign in</a></div>
          </div>
          <div className="closing-mark" lang="ar" aria-hidden>نشر</div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="wrap foot-grid">
          <div className="foot-brand"><span className="mark"><b>Nashr</b><i lang="ar">نشر</i></span><p>The UAE media marketplace. Prices in AED, times in Dubai time.</p></div>
          <nav aria-label="Product"><b>Product</b><a href="/calendar">Calendar</a><a href="/directory">Directory</a><button type="button" className="text-link" onClick={() => go('how')}>How it works</button></nav>
          <nav aria-label="Account"><b>Account</b><a href="/request-access">Request access</a><a href="/sign-in">Sign in</a></nav>
          <nav aria-label="Legal"><b>Legal</b><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a></nav>
        </div>
        <div className="wrap foot-base"><span>© {new Date().getFullYear()} Nashr</span><span>Made for the UAE media market</span></div>
      </footer>
    </div>
  )
}
