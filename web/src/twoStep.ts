import { useEffect, useState } from 'react'
import { api } from './api'

/** True when Nashr asks for two-step sign-in before money moves and this person has not turned it on yet. */
export function useNeedsTwoStep(active = true) {
  const [needs, setNeeds] = useState(false)
  useEffect(() => { if (active) api<{ twoStep: { on: boolean; requiredForMoney: boolean } }>('/me/account')
    .then(a => setNeeds(a.twoStep.requiredForMoney && !a.twoStep.on), () => {}) }, [active])
  return needs
}
