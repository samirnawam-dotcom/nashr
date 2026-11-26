import { useEffect } from 'react'
import { navigate } from './nav'
import { openAthena } from './athena/open'

/** An old address that moved: replace it (Back does not return to it). */
export function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, true) }, [to])
  return null
}

/** The old Athena page: Athena is now the panel on every page, so go to the start and open it there. */
export function AthenaPage({ home }: { home: string }) {
  useEffect(() => { navigate(home, true); const k = setTimeout(() => openAthena({}), 300); return () => clearTimeout(k) }, [home])
  return null
}
