/** Open Athena's panel from anywhere: a tab, a question to ask, or a product to ask about ("Ask Athena about this"). */
export const openAthena = (detail: { tab?: 'ask' | 'noticed'; ask?: string; about?: { placementId: string; title: string } } = {}) =>
  window.dispatchEvent(new CustomEvent('athena:open', { detail }))
