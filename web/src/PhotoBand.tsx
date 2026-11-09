/**
 * The page header: title, one line on what the page is for, and the page's actions on the right. Compact by design (owner's
 * feedback: the old photo banner took the room the page needs). `img` and `focus` are kept for callers but no longer drawn.
 */
export function PhotoBand({ title, sub, children }: { img?: string; title: string; sub?: React.ReactNode; focus?: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-copy"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="page-head-actions">{children}</div>}
    </header>
  )
}
