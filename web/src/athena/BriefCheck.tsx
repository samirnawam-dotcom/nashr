import { t } from '../i18n'
import { containsContactDetails } from '../../../server/core/contact'
import { AthenaPanel } from './Owl'

/*
 * Athena's brief check, as the buyer writes a brief (bid drawer and campaign): what would be refused, and what publishers
 * need to run the ad well, checked live from the brief itself and this outlet's own rules. Rules only; nothing is sent.
 * "Must fix" items are the ones Nashr or the publisher will refuse; the rest are advice.
 */
export type BriefLike = { advertiser?: string; industry?: string; message?: string; language?: string; landingUrl?: string; notes?: string; disclaimer?: string; draftFileKey?: string }
type Issue = { id: string; must: boolean; text: string }

// Words that tell people what to do (a call to action), English and Arabic.
const CTA = /\b(call|visit|apply|book|buy|shop|order|download|sign up|register|join|subscribe|learn more|find out|discover|get|try|start|open|claim|save|reserve|contact|enquire|enroll|enrol|install|watch|listen|follow|scan|text|whatsapp|today|now)\b|اتصل|زور|زر|قدّم|قدم|احجز|اشتر|تسوق|اطلب|حمّل|حمل|سجّل|سجل|انضم|اشترك|اكتشف|احصل|جرّب|جرب|ابدأ|افتح|وفّر|تواصل|شاهد|استمع|تابع|امسح|الآن|اليوم/i
const REGULATED: Record<string, string> = { Banking: 'Central Bank', 'Real estate': 'RERA / Land Department', 'Crypto & trading': 'SCA / VARA', Health: 'DoH / DHA / MOHAP' }
const LINKED = ['digital', 'social', 'newsletter']

export function briefIssues(b: BriefLike, ctx: { channel?: string | null; notAccepted?: string[]; outletLanguage?: string | null; creativeRequired?: boolean }): Issue[] {
  const out: Issue[] = [], msg = (b.message ?? '').trim()
  if (b.industry && ctx.notAccepted?.some(x => x.toLowerCase() === b.industry!.toLowerCase()))
    out.push({ id: 'blocked', must: true, text: t('This publisher does not accept {industry} ads. Choose another outlet, or check the industry.', { industry: t(b.industry) }) })
  if (containsContactDetails(msg) || containsContactDetails(b.notes))
    out.push({ id: 'contact', must: true, text: t('Remove the phone number or email: Nashr does not allow contact details in briefs. Publishers reach you through Nashr.') })
  const url = (b.landingUrl ?? '').trim()
  if (url && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) out.push({ id: 'url', must: true, text: t('The landing page link does not look right. It should start with https://') })
  else if (!url && ctx.channel && LINKED.includes(ctx.channel)) out.push({ id: 'nourl', must: true, text: t('Add the landing page link: online ads need somewhere to send people.') })
  if (ctx.creativeRequired !== false && !b.draftFileKey) out.push({ id: 'creative', must: true, text: t('Add your creative file. Publishers check it before they accept.') })
  if (msg && msg.length < 25) out.push({ id: 'short', must: false, text: t('Say a little more: what you offer, and what people should do next.') })
  else if (msg && !CTA.test(msg)) out.push({ id: 'cta', must: false, text: t('Add a call to action, like "Apply today" or "Visit our showroom", so people know what to do.') })
  if (b.industry && REGULATED[b.industry] && !(b.disclaimer ?? '').trim())
    out.push({ id: 'disclaimer', must: false, text: t('{industry} ads in the UAE usually carry a licence number or disclaimer ({body}). Add it so the publisher includes it.', { industry: t(b.industry), body: REGULATED[b.industry] }) })
  const lang = ctx.outletLanguage
  if (lang && b.language && b.language !== 'bilingual' && b.language !== 'other' && lang !== 'both' && ['english', 'arabic'].includes(lang) && lang !== b.language)
    out.push({ id: 'lang', must: false, text: lang === 'arabic' ? t('This outlet runs in Arabic, and your creative is in English. Consider an Arabic or bilingual version.') : t('This outlet runs in English, and your creative is in Arabic. Consider an English or bilingual version.') })
  return out
}

export function BriefCheck({ brief, channel, notAccepted, outletLanguage, creativeRequired }: { brief: BriefLike; channel?: string | null; notAccepted?: string[]; outletLanguage?: string | null; creativeRequired?: boolean }) {
  // nothing to say until the brief is started
  if (!brief.advertiser?.trim() && !brief.message?.trim()) return null
  const issues = briefIssues(brief, { channel, notAccepted, outletLanguage, creativeRequired })
  const must = issues.filter(i => i.must), tips = issues.filter(i => !i.must)
  return <AthenaPanel label={t('brief check')} say={issues.map(i => i.id).join(',') || 'ok'} className="brief-check">
    {!issues.length ? <p className="small">{t('The brief has what publishers need. Good to go.')}</p> : <>
      {must.length > 0 && <><p className="small"><b>{t('Must fix')}</b></p><ul className="bc-list must">{must.map(i => <li key={i.id}>{i.text}</li>)}</ul></>}
      {tips.length > 0 && <><p className="small"><b>{t('Would help')}</b></p><ul className="bc-list">{tips.map(i => <li key={i.id}>{i.text}</li>)}</ul></>}
    </>}
  </AthenaPanel>
}
