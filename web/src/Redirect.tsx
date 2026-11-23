import { useEffect } from 'react'
import { navigate } from './nav'

/** An old address that moved: replace it (Back does not return to it). */
export function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, true) }, [to])
  return null
}
