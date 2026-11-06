/** A slim photographic page header: the brand's channel photography behind the page title. Decorative image; the title carries the meaning. */
export function PhotoBand({ img, title, sub, children }: { img: string; title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="photo-band">
      <img src={img} alt="" width={1600} height={500} decoding="async" fetchPriority="high" />
      <div className="photo-band-copy"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="photo-band-actions">{children}</div>}
    </header>
  )
}
