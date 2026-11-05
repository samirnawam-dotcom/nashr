import { useEffect, useRef, useState } from 'react'
import './landing.css'

/**
 * The first page visitors see. Everything past it can be browsed without an account; signing in is only needed to act.
 * In-page links scroll instead of using #anchors, because the hash is the app's router.
 */
const STEPS = [3500, 3605, 3714, 3826, 3941]
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

export function Landing() {
  const head = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null), steps = useRef<HTMLOListElement>(null)
  const [i, setI] = useState(2), [hours, setHours] = useState(6)

  useEffect(() => {
    document.title = 'Nashr: book UAE airtime and pages in one place'
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    // The orchestrated moment: the playhead sweeps the board and the top bid climbs in 3% steps until you lead.
    let raf = 0, timer = 0
    if (!reduce) {
      timer = window.setInterval(() => {
        setI(n => (n + 1) % STEPS.length); setHours(h => (h <= 1 ? 6 : h - 1))
        const c = card.current; if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash') }
      }, 2600)
      const t0 = performance.now()
      const sweep = (t: number) => {
        const p = ((t - t0) / 14000) % 1
        if (head.current) head.current.style.left = `calc(var(--gut, 92px) + (100% - var(--gut, 92px)) * ${(0.04 + p * 0.92).toFixed(4)})`
        raf = requestAnimationFrame(sweep)
      }
      raf = requestAnimationFrame(sweep)
    }
    const gut = () => head.current?.parentElement?.style.setProperty('--gut', innerWidth <= 560 ? '64px' : '92px')
    gut(); addEventListener('resize', gut)
    // The five steps fill in once when they come into view (they are fully readable before that).
    const items = [...(steps.current?.children ?? [])] as HTMLElement[]
    const fill = () => items.forEach((li, k) => setTimeout(() => { li.classList.add('on'); li.style.setProperty('--fill', '100%') }, reduce ? 0 : k * 380))
    let io: IntersectionObserver | undefined
    if ('IntersectionObserver' in window && !reduce && steps.current) {
      io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { fill(); io!.disconnect() } }, { threshold: .4 })
      io.observe(steps.current)
    } else fill()
    return () => { cancelAnimationFrame(raf); clearInterval(timer); removeEventListener('resize', gut); io?.disconnect(); document.title = 'Nashr' }
  }, [])

  return (
    <div className="lp">
      <header className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <span className="kicker">Live in the UAE. Saudi Arabia coming soon.</span>
              <h1>Book UAE airtime and pages in one place.</h1>
              <span className="ar" lang="ar">احجز الإعلانات في الإذاعة والتلفزيون والصحف والمنصات الرقمية من مكان واحد</span>
              <p className="lede">Bid on radio breaks, TV spots, print pages, homepage takeovers and podcast reads, from the publishers themselves. Your payment is held until the publisher proves the ad ran.</p>
              <div className="cta-row"><a className="btn signal" href="#/calendar">Browse the calendar</a><a className="btn ghost" href="#/request-access">Request access</a></div>
              <p className="fine">Browse every slot and price freely. Sign in when you're ready to bid or book. <button type="button" className="text-link" onClick={() => go('how')}>See how it works ↓</button></p>
            </div>

            <a className="board" href="#/calendar" aria-label="Example programme board. Open the live calendar">
              <div className="board-h"><span><b>Mon 16 Nov</b>, Dubai time</span><span className="live">Bidding live</span></div>
              <div className="axis" aria-hidden="true"><span></span><div className="ticks"><span>06:00</span><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span></div></div>
              <div className="lanes" aria-hidden="true">
                <div className="lane"><div className="who">Skyline FM<small>Radio</small></div><div className="track">
                  <div className="slot hot" style={{ left: '4%', width: '22%' }}><b>Morning Markets</b>4 breaks</div>
                  <div className="slot" style={{ left: '72%', width: '20%' }}><b>Drive Home</b>quick sale</div></div></div>
                <div className="lane"><div className="who">Dubai One<small>TV</small></div><div className="track">
                  <div className="slot booked" style={{ left: '33%', width: '16%' }}><b>Market Open</b>booked</div>
                  <div className="slot" style={{ left: '78%', width: '18%' }}><b>Evening</b>2 spots</div></div></div>
                <div className="lane"><div className="who">Gulf News<small>Print</small></div><div className="track">
                  <div className="slot" style={{ left: '1%', width: '97%' }}><b>Full page, business section</b>all day, from AED 20,000</div></div></div>
                <div className="lane"><div className="who">The Majlis<small>Podcast</small></div><div className="track">
                  <div className="slot" style={{ left: '2%', width: '28%' }}><b>Weekly episode</b>pre-roll, mid-roll</div></div></div>
                <div className="playhead" ref={head}></div>
              </div>
              <div className="bidcard" ref={card}>
                <span className="t">Skyline FM, Break 2 at 07:15, top bid</span>
                <span className="state"><span className="pill soon">Closes in {hours}h</span>{i % 2 === 0 && <span className="pill lead">You lead</span>}</span>
                <span className="amt num">AED {STEPS[i].toLocaleString('en-US')}</span>
              </div>
            </a>
          </div>
        </div>
        <div className="channels"><ul className="wrap" aria-label="Channels">
          <li><b>Radio</b><span>Single breaks, any break, packages</span></li>
          <li><b>TV</b><span>Spots by programme and time</span></li>
          <li><b>Print</b><span>Pages by edition and section</span></li>
          <li><b>Digital</b><span>Homepage takeovers by day</span></li>
          <li><b>Podcasts</b><span>Pre-roll, mid-roll, post-roll</span></li>
        </ul></div>
      </header>

      <div>
        <section className="block" id="how"><div className="wrap">
          <div className="eyeline">How it works</div>
          <h2>From bid to broadcast, with the money held in between.</h2>
          <p className="intro">Every booking follows the same five steps. Each side always knows what happens next and when.</p>
          <ol className="steps" ref={steps}>
            <li><h3>Bid or request</h3><p>Bid in 3% steps, set an auto-bid maximum, or ask for the buy-now price. Nothing is charged.</p></li>
            <li><h3>Publisher accepts</h3><p>The publisher sees your brief and decides within 24 hours.</p></li>
            <li className="pay"><h3>Pay, money held</h3><p>Pay within 48 hours. The money waits with Nashr, not the publisher.</p></li>
            <li><h3>Ad runs, proof sent</h3><p>The publisher sends proof: the as-run log, the tearsheet, the screenshots.</p></li>
            <li className="pay"><h3>Approve, money released</h3><p>You approve and the publisher is paid. Report an issue and the release pauses.</p></li>
          </ol>
        </div></section>

        <section className="block" style={{ paddingTop: 0 }}><div className="wrap split">
          <article className="aud">
            <span className="who">For brands and agencies</span>
            <h3>Every UAE outlet on one calendar.</h3>
            <ul>
              <li>Browse slots by day, week or month, in Dubai time, with prices excluding VAT.</li>
              <li>See what's typical: prices are labelled as Nashr history, the publisher's rate or an estimate.</li>
              <li>Plan campaigns against a budget, with committed and remaining spend.</li>
              <li>Upload creative, approve proof and download the publisher's tax invoice in one place.</li>
            </ul>
          </article>
          <article className="aud pub">
            <span className="who">For radio, TV, print, digital and podcasts</span>
            <h3>Sell your inventory to serious buyers.</h3>
            <ul>
              <li>List programmes with their breaks, set a reserve, a buy-now price and a package price.</li>
              <li>Decide with the full picture: the buyer, the brief and exactly what you receive.</li>
              <li>Get paid when the buyer approves proof, or automatically after five working days.</li>
              <li>Tax invoices issued in your name and TRN, and a monthly payout statement.</li>
            </ul>
          </article>
        </div></section>

        <section className="block" style={{ paddingTop: 0 }}><div className="wrap held-section">
          <div>
            <div className="eyeline">Your payment, held</div>
            <h2>Nobody is paid until the ad has run.</h2>
            <p className="intro" style={{ marginBottom: 0 }}>The buyer pays Nashr, Nashr holds it, and the publisher is paid when the proof is approved. If the ad doesn't run, the buyer is refunded. The VAT and the fee are shown before anyone commits.</p>
          </div>
          <div className="flow" aria-label="Example booking: AED 5,500 radio break">
            <div className="flow-row">
              <div className="node"><b>Buyer</b>pays AED 5,775</div>
              <div className="pipe" aria-hidden="true"><i></i></div>
              <div className="node held"><b>Held</b>until proof</div>
            </div>
            <table className="ledger"><tbody>
              <tr><td>Break price</td><td>AED 5,500</td></tr>
              <tr><td>VAT, charged by the publisher (5%)</td><td>AED 275</td></tr>
              <tr><td>Nashr commission (example, 12%)</td><td>−AED 660</td></tr>
              <tr className="total"><td>Publisher receives on approval</td><td>AED 5,115</td></tr>
            </tbody></table>
            <p className="note">Example figures. The commission rate is agreed with each publisher.</p>
          </div>
        </div></section>

        <section className="block" style={{ paddingTop: 0 }}><div className="wrap">
          <div className="lp-facts">
            <div><b className="num">24 h</b><span>for the publisher to accept or decline</span></div>
            <div><b className="num">48 h</b><span>for the buyer to pay once accepted</span></div>
            <div><b className="num">3%</b><span>minimum step between bids</span></div>
            <div><b className="num">5 days</b><span>working days to review proof, then automatic release</span></div>
          </div>
        </div></section>
      </div>

      <section className="access"><div className="wrap">
        <div>
          <h2>Ready to book?</h2>
          <p className="intro" style={{ color: 'var(--on-studio-dim)' }}>Nashr is invite-only for UAE brands, agencies and media outlets. Nashr's team reviews every request and sends an invite to your work email.</p>
          <div className="big-ar" lang="ar" aria-hidden="true">نشر</div>
        </div>
        <div className="access-cta">
          <h3>Get an invite</h3>
          <p>Tell us who you are and what you'd like to book or sell. It takes a minute.</p>
          <div className="cta-links"><a className="btn teal" href="#/request-access">Request access</a><a className="link" href="#/calendar">Or browse the calendar first</a></div>
          <p className="small">Already invited? <a className="link" href="#/sign-in">Sign in</a></p>
        </div>
      </div></section>
      <footer className="lp-foot"><div className="wrap"><span>Nashr, the UAE media marketplace. Prices in AED, times in Dubai time.</span><span className="foot-links"><a href="#/terms">Terms</a><a href="#/privacy">Privacy</a><a href="#/refunds">Refunds</a><a href="#/sign-in">Sign in</a></span></div></footer>
    </div>
  )
}
