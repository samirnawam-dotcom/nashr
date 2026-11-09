/*
 * What each notification says, and where it leads: one wording for the bell in the app and for the emails the server sends.
 * No browser code here: the translator and the formats are passed in (the app's t(), or the server's Arabic dictionary).
 */
export type N = { id?: number; kind: string; dealId: string | null; dealRef?: string | null; data: any; at?: string; read?: boolean }
type Tr = (en: string, vars?: Record<string, string | number>) => string

export function noticeTexts(t: Tr, money: (fils: number) => string, day: (iso: string) => string): Record<string, (n: N) => string> {
  const aedOf = (n: number | undefined) => n == null ? '' : money(n)
  return {
  'deal.awaiting_payment': () => t('The publisher accepted. Pay to secure the slot.'),
  'deal.declined': () => t('Your request was not selected.'),
  'deal.lapsed': () => t('The payment window passed and the booking lapsed.'),
  'deal.secured': () => t('Payment is secured.'),
  'deal.cancelled': () => t('The booking was cancelled.'),
  'deal.refunded': () => t('A refund was issued.'),
  'deal.released': () => t('Payment was released.'),
  'access.staff_signed_in': n => t("Nashr's team signed in to your account as {user} to help. Reason: {reason}", { user: n.data?.user ?? '', reason: n.data?.reason ?? '' }),
  'support.new': n => t('New question from {company}.', { company: n.data?.company ?? '' }),
  'support.replied': () => t('Nashr answered your question.'),
  'ops.alert': n => t('Needs attention: {detail}', { detail: n.data?.detail ?? '' }),
  'ops.cleared': n => t('Cleared: {detail}', { detail: n.data?.detail ?? '' }),
  'access.two_step_reset': n => t('Nashr turned off two-step sign-in for {user}. Reason: {reason}', { user: n.data?.user ?? '', reason: n.data?.reason ?? '' }),
  'access.reset_issued': n => t('Nashr issued a password reset link for {user}, who asked for one.', { user: n.data?.user ?? '' }),
  'chargeback.closed': n => n.data?.won ? t("The bank decided a chargeback for Nashr. Decide the dispute now.") : t("The bank decided a chargeback for the buyer. The booking is closed as refunded."),
  'bid.won': n => t('You won {slot} at {amount}. The publisher confirms next, then you pay.', { slot: `${n.data?.outlet} · ${n.data?.label}`, amount: aedOf(n.data?.amount ?? 0) }),
  'bid.closed_lost': n => t('Bidding closed on {slot}. Another bid was higher; if the publisher passes on it, you may be offered the slot.', { slot: `${n.data?.outlet} · ${n.data?.label}` }),
  'deal.opened': n => n.data?.kind === 'buy_now' ? t('New buy-now request.') : t('New booking to decide on.'),
  'access.reset_requested': () => t('Someone asked to reset their password. Send them a link from their account page.'),
  'bid.not_selected': n => t('Your bid on {slot} was not selected. The slot has gone to another buyer or is no longer on sale.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` }),
  'interest.received': n => t('A buyer is interested in {slot}. Accept to book it.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` }),
  'interest.not_selected': n => t('The publisher booked {slot} with another buyer.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` }),
  'interest.expired': n => t('The publisher did not take up your interest in {slot} before it closed.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` }),
  'bid.outbid': n => n.data?.max
    ? t('Your auto-bid maximum of {max} on {slot} was passed. Raise it to get back in front.', { max: aedOf(n.data.max), slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` })
    : t('You were outbid on {slot}.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` }),
  'bid.auto_raised': n => t('Auto-bid kept you in front on {slot}: you lead at {amount} (maximum {max}).', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? ''}`, amount: aedOf(n.data?.amount), max: aedOf(n.data?.max) }),
  'bid.auto_cap': n => t('Auto-bid reached your maximum of {max} on {slot}. You still lead; raise it in case someone bids again.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? ''}`, max: aedOf(n.data?.max) }),
  'creative.sent': () => t('New creative to review.'),
  'creative.approved': () => t('Your creative was approved.'),
  'creative.changes_requested': n => n.data?.reason ? t('The publisher asked for changes: {reason}', { reason: n.data.reason }) : t('The publisher asked for changes.'),
  'creative.technical_issue': () => t('Your file has a technical problem. Upload a fixed version.'),
  'creative.rejected': () => t('Your creative was rejected.'),
  'proof.ready': () => t('Proof is ready for your review.'),
  'reminder.decide': () => t('Reminder: a booking request is waiting for your decision.'),
  'reminder.pay': () => t('Reminder: pay to secure your booking before the deadline.'),
  'reminder.review': () => t('Reminder: review the proof. The money is released automatically at the deadline.'),
  'reminder.issue': () => t('Reminder: respond to the reported issue, or it goes to Nashr to decide.'),
  'issue.reported': () => t('The buyer reported an issue.'),
  'issue.offer': () => t('The publisher offered a fix for your issue.'),
  'issue.resolved': () => t('The issue was resolved.'),
  'dispute.opened': n => n.data?.decideBy ? t('Nashr will decide this dispute by {date}. Add your side and any files from the booking.', { date: day(n.data.decideBy) }) : t('A dispute was opened.'),
  'dispute.statement': n => n.data?.side === 'buyer' ? t('The buyer added to the dispute case.') : t('The publisher added to the dispute case.'),
  'dispute.decided': n => (({ release: t('Nashr decided the dispute: the payment is released to the publisher.'), refund: t('Nashr decided the dispute: full refund to the buyer.'),
    partial_refund: t('Nashr decided the dispute: a partial refund to the buyer.'), make_good: t('Nashr decided the dispute: the ad runs again.') } as Record<string, string>)[n.data?.outcome] ?? t('Nashr decided the dispute.'))
    + (n.data?.reason ? ` ${t('Reason: {reason}', { reason: n.data.reason })}` : ''),
  'deal.nashr_action': n => ({ cancel: t('Nashr cancelled this booking.'), refund: t('Nashr refunded this booking in full.'),
    partial_refund: t('Nashr refunded part of this booking and released the rest.'), release: t('Nashr released the payment to the publisher.') } as Record<string, string>)[n.data?.action]
    + (n.data?.reason ? ` ${t('Reason: {reason}', { reason: n.data.reason })}` : ''),
  'bid.voided': n => t('Nashr voided your bid on {slot}. Reason: {reason}', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? ''}`, reason: n.data?.reason ?? '' }),
  'chargeback.opened': n => n.data?.released ? t("A buyer's bank disputed a payment that was already released. Recover it from the publisher.") : t("A buyer's bank disputed a payment. The booking is now a dispute for Nashr."),
  'prerun.confirm_final_version': () => t('Confirm the final version before air.'),
  'prerun.confirm_slot_and_creative': () => t('Confirm the slot and creative before air.'),
  'message.new': n => n.data?.from === 'seller' ? t('New message from the publisher.') : t('New message from the buyer.'),
  'search.match': n => t(n.data?.count === 1 ? '1 new slot matches your search “{name}”.' : '{n} new slots match your search “{name}”.', { n: n.data?.count ?? '', name: n.data?.name ?? '' }),
  'access.requested': n => t('{company} requested access.', { company: n.data?.company ?? t('Someone') }),
  'quote.requested': n => t('Quote requested for {outlet}.', { outlet: n.data?.outlet ?? t('an outlet') }),
  }
}

/** The page a notification opens, for the person's role. */
export function noticeHref(n: N, role: string): string | undefined {
  return n.kind === 'support.new' ? '/support' : n.kind.startsWith('ops.') ? '/admin' : n.kind === 'support.replied' ? '/help' : n.kind === 'message.new' && n.dealId ? `/messages/${n.dealId}` : n.dealId ? (role === 'seller' ? `/deals/${n.dealId}` : `/bookings/${n.dealId}`) : n.kind === 'access.reset_requested' && n.data?.companyId ? `/accounts/${n.data.companyId}` : n.kind === 'interest.received' && n.data?.slotId ? `/slots/${n.data.slotId}` : n.kind.startsWith('bid.') || n.kind.startsWith('interest.') ? '/calendar' : n.kind === 'search.match' ? `/calendar?search=${n.data?.searchId}` : undefined
}
