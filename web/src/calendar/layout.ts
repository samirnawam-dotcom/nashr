// Calendar maths, kept pure so it can be tested. Times are shown in Dubai time (UTC+4, no daylight saving).

const DUBAI_MS = 4 * 3_600_000
export const DAY_START = 6 * 60, DAY_END = 23 * 60 // minutes shown in day and week views

export function dubai(iso: string) {
  const d = new Date(new Date(iso).getTime() + DUBAI_MS)
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() || 7 }
}
export const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
export const todayInDubai = () => dubai(new Date().toISOString()).date

/** Monday-to-Sunday dates of the week containing `date`. */
export function weekOf(date: string) {
  const wd = new Date(date + 'T12:00:00Z').getUTCDay() || 7
  return Array.from({ length: 7 }, (_, i) => addDays(date, i - wd + 1))
}

/** Weeks (Monday start) covering the month of `date`. */
export function monthGrid(date: string) {
  const first = date.slice(0, 8) + '01'
  const weeks: string[][] = []
  for (let start = weekOf(first)[0]; start.slice(0, 7) <= date.slice(0, 7); start = addDays(start, 7)) weeks.push(weekOf(start))
  return weeks
}

/** Print editions and whole-day digital items have no time: they sit in the all-day lane, as in Google Calendar. */
// whole-day items (print editions) and week-long ones (a week's banner) sit in the all-day lane
export const isAllDay = (s: { startsAt: string; endsAt: string | null }) => dubai(s.startsAt).minutes === 0
  && (!s.endsAt || new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime() >= 86_400_000)

/** Overlapping events share the width: each gets a column and the number of columns in its cluster. */
export function layoutDay<T extends { id: string; start: number; end: number }>(events: T[]) {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end)
  const out = new Map<string, { col: number; cols: number; cluster: number }>()
  let cluster: { e: T; col: number }[] = [], clusterEnd = -1, n = 0
  // `cluster` numbers each run of overlapping events, so a crowded run can be folded into "+N more"
  const flush = () => { if (!cluster.length) return; const cols = Math.max(0, ...cluster.map(c => c.col)) + 1, id = n++
    cluster.forEach(c => out.set(c.e.id, { col: c.col, cols, cluster: id })); cluster = [] }
  for (const e of sorted) {
    if (e.start >= clusterEnd) { flush(); clusterEnd = -1 }
    const used = new Set(cluster.filter(c => c.e.end > e.start).map(c => c.col))
    let col = 0; while (used.has(col)) col++
    cluster.push({ e, col }); clusterEnd = Math.max(clusterEnd, e.end)
  }
  flush()
  return out
}
