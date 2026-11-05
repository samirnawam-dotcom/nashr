import { Waitlist } from './directory/Directory'

/** Athena, the planning assistant, is on hold until there is enough real data (brief section 21). Do not build the planner now. */
export function AthenaPage() {
  return (
    <main className="narrow">
      <span className="badge">Coming soon</span>
      <h1 style={{ margin: '12px 0' }}>Athena</h1>
      <p>Athena will turn a campaign brief into a suggested set of bookable slots across UAE media, based on real winning prices, audiences and results on Nashr.</p>
      <p className="muted">We're collecting that data now with every booking. Until then, plan with <a href="/campaigns">Campaigns</a> and the <a href="/directory">Directory</a>.</p>
      <Waitlist topic="Athena" label="Tell me when Athena launches" />
    </main>
  )
}
