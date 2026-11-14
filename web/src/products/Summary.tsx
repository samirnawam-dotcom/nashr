import { useState } from 'react'
import { t } from '../i18n'
import { money } from '../format'
import { AUDIENCES } from '../../../server/shared/audiences'
import { HAS_PROGRAMMES, LANGUAGES, MARKETS, REACH_UNITS, SPEC_TYPES, TYPE_FIELDS, label, type Field } from '../../../server/shared/products'
import { CHANNEL_NAME } from '../media'
import './summary.css'

/*
 * A product's 4-tab summary (Details, Audience, Sectors, Requirements), made only from what the publisher filled in on its form.
 * The publisher sees it on Products; buyers see the same on an outlet's page in the Directory (owner's buyer-side fixes), without
 * the advertisers the publisher refuses by name.
 */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const daysText = (d: number[]) => d.length === 7 ? t('Every day') : d.join() === '1,2,3,4,5' ? t('Mon–Fri') : d.join() === '6,7' ? t('Weekend') : d.map(x => t(DAYS[x - 1])).join(', ')
export const mediaName = (m: { channel: string; channelOther?: string | null }) => m.channel === 'other' ? m.channelOther || t('Other') : CHANNEL_NAME[m.channel] ?? m.channel

export type SummaryProduct = { name: string; channel: string; channelOther?: string | null; language: string | null; nameAr?: string | null; website?: string | null
  audience: string | null; reach: number | null; reachUnit: string | null; audiences?: string[]; markets?: string[]; sectors?: string[]; blocked?: string[]; blockedAdvertisers?: string[]
  specType: string | null; specDetail: string | null; creativeDays: number | null; closeDays: number | null; defaultPrice: number | null; notes: string | null
  details: Record<string, any>; sellable: { kind: string; days?: number[] }[] }

/** One line of the summary: shown only when the publisher filled it in. */
const Fact = ({ k, v }: { k: string; v?: string | number | null }) => v == null || v === '' ? null : <div><dt>{k}</dt><dd dir="auto">{v}</dd></div>
const TABS: [string, string][] = [['details', 'Details'], ['audience', 'Audience'], ['sectors', 'Sectors'], ['requirements', 'Requirements']]

/** A product's summary, made only from what the publisher filled in on its form: details, audience, sectors, requirements. */
export function ProductSummary({ m, buyer }: { m: SummaryProduct; buyer?: boolean }) {
  const [tab, setTab] = useState('details'), d = m.details ?? {}, byProgramme = HAS_PROGRAMMES.includes(m.channel) && (!!m.details?.programmes || m.sellable.some(s => s.kind === 'programme'))
  const main = m.sellable.find(s => s.kind === 'main'), timed = ['radio', 'tv'].includes(m.channel)
  const fields = byProgramme ? [] : TYPE_FIELDS[m.channel] ?? []
  const value = (f: Field): string => f.kind === 'days' ? (d.days?.length ? daysText(d.days) : '') : f.kind === 'airtime' ? (timed && d.airStart ? `${d.airStart}–${d.airEnd ?? ''}` : '')
    : f.kind === 'breaks' ? (timed ? (d.breaks ?? []).map((b: any) => b.at).filter(Boolean).join(', ') : '') : f.options ? t(label(f.options, d[f.key])) : String(d[f.key] ?? '')
  const list = (v?: string[] | null) => (v ?? []).map(x => t(x)).join(', ')
  return <div className="pr-sum">
    <div className="seg pr-tabs" role="tablist" aria-label={m.name}>{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
    {tab === 'details' && <dl className="pr-facts">
      <Fact k={t('Media type')} v={mediaName(m)} />
      {fields.map(f => <Fact key={f.key} k={f.kind === 'airtime' ? t('Airtime') : f.kind === 'breaks' ? t('Breaks') : t(f.label)} v={value(f)} />)}
      {byProgramme && <Fact k={t('Sold by')} v={t(m.sellable.length === 1 ? '1 programme' : '{n} programmes', { n: m.sellable.length })} />}
      {!byProgramme && !fields.some(f => f.kind === 'days') && main?.days?.length ? <Fact k={t('Days')} v={daysText(main.days)} /> : null}
      <Fact k={t('Language')} v={m.language ? t(label(LANGUAGES, m.language)) : ''} />
      <Fact k={t('Name in Arabic')} v={m.nameAr} />
      <Fact k={t('Website')} v={m.website} />
    </dl>}
    {tab === 'audience' && <dl className="pr-facts">
      <Fact k={t('Audience')} v={m.audience} />
      <Fact k={t('Reach')} v={m.reach ? `${m.reach.toLocaleString('en-US')}${m.reachUnit ? ` ${t(label(REACH_UNITS, m.reachUnit)).toLowerCase()}` : ''}` : ''} />
      <Fact k={t('Audience tags')} v={(m.audiences ?? []).map(k => t(AUDIENCES.find(a => a[0] === k)?.[1] ?? k)).join(', ')} />
      <Fact k={t('Markets')} v={(m.markets ?? []).map(x => t(label(MARKETS, x))).join(', ')} />
    </dl>}
    {tab === 'sectors' && <dl className="pr-facts">
      <Fact k={t('Sectors accepted')} v={m.sectors?.length ? list(m.sectors) : t('All sectors')} />
      <Fact k={t('Sectors not accepted')} v={list(m.blocked)} />
      {!buyer && <Fact k={t('Advertisers not run')} v={(m.blockedAdvertisers ?? []).join(', ')} />}
    </dl>}
    {tab === 'requirements' && <dl className="pr-facts">
      <Fact k={t('Creative specs')} v={[m.specType ? t(label(SPEC_TYPES[m.channel] ?? SPEC_TYPES.other, m.specType)) : '', m.specDetail].filter(Boolean).join(', ')} />
      <Fact k={t('Creative due')} v={m.creativeDays != null ? t('{n} days before it runs', { n: m.creativeDays }) : ''} />
      <Fact k={t('Bidding closes')} v={m.closeDays != null ? t('{n} days before it runs', { n: m.closeDays }) : ''} />
      <Fact k={t('Default price')} v={m.defaultPrice ? money(m.defaultPrice) : ''} />
      <Fact k={t('Anything else buyers should know')} v={m.notes} />
    </dl>}
  </div>
}

