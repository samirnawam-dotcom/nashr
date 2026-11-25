/*
 * The UAE advertising year, for Athena's forecasts: the moments when demand for media usually rises. Islamic dates follow the
 * moon, so those are the expected dates (they can move by a day or two). Dates are Dubai days, inclusive. Shared by the
 * server and the screens. Add next years here as they are announced.
 */
export type Season = { key: string; name: string; nameAr: string; from: string; to: string }

export const SEASONS: Season[] = [
  { key: 'ramadan', name: 'Ramadan', nameAr: 'رمضان', from: '2026-02-18', to: '2026-03-19' },
  { key: 'eid_fitr', name: 'Eid al-Fitr', nameAr: 'عيد الفطر', from: '2026-03-20', to: '2026-03-23' },
  { key: 'eid_adha', name: 'Eid al-Adha', nameAr: 'عيد الأضحى', from: '2026-05-26', to: '2026-05-29' },
  { key: 'summer', name: 'Summer sales', nameAr: 'عروض الصيف', from: '2026-07-01', to: '2026-08-15' },
  { key: 'school', name: 'Back to school', nameAr: 'العودة إلى المدارس', from: '2026-08-17', to: '2026-09-06' },
  { key: 'white_friday', name: 'White Friday', nameAr: 'الجمعة البيضاء', from: '2026-11-23', to: '2026-11-30' },
  { key: 'national_day', name: 'UAE National Day', nameAr: 'اليوم الوطني', from: '2026-11-30', to: '2026-12-03' },
  { key: 'dsf', name: 'Dubai Shopping Festival', nameAr: 'مهرجان دبي للتسوق', from: '2026-12-04', to: '2027-01-17' },
  { key: 'new_year', name: 'New Year', nameAr: 'رأس السنة', from: '2026-12-28', to: '2027-01-01' },
  { key: 'ramadan', name: 'Ramadan', nameAr: 'رمضان', from: '2027-02-08', to: '2027-03-09' },
  { key: 'eid_fitr', name: 'Eid al-Fitr', nameAr: 'عيد الفطر', from: '2027-03-10', to: '2027-03-13' },
  { key: 'eid_adha', name: 'Eid al-Adha', nameAr: 'عيد الأضحى', from: '2027-05-16', to: '2027-05-19' },
  { key: 'summer', name: 'Summer sales', nameAr: 'عروض الصيف', from: '2027-07-01', to: '2027-08-15' },
  { key: 'school', name: 'Back to school', nameAr: 'العودة إلى المدارس', from: '2027-08-23', to: '2027-09-05' },
  { key: 'white_friday', name: 'White Friday', nameAr: 'الجمعة البيضاء', from: '2027-11-22', to: '2027-11-29' },
  { key: 'national_day', name: 'UAE National Day', nameAr: 'اليوم الوطني', from: '2027-11-30', to: '2027-12-03' },
  { key: 'dsf', name: 'Dubai Shopping Festival', nameAr: 'مهرجان دبي للتسوق', from: '2027-12-03', to: '2028-01-16' },
]

/** The Dubai date (YYYY-MM-DD) of a moment. */
export const dubaiDay = (iso: string | Date) => new Date(new Date(iso).getTime() + 4 * 3_600_000).toISOString().slice(0, 10)

/** The seasons a Dubai date falls in. */
export const seasonsOn = (day: string) => SEASONS.filter(s => s.from <= day && day <= s.to)

/** The seasons that start within `days` of a Dubai date (or are running then). */
export const seasonsSoon = (day: string, days: number) => {
  const until = new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
  return SEASONS.filter(s => s.to >= day && s.from <= until)
}
