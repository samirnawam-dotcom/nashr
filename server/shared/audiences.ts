/**
 * The audiences buyers can pick (owner decision: a fixed list Nashr curates, so the filter stays clean).
 * Publishers tick the ones their outlets and placements reach; a placement with none takes its outlet's.
 * Shared by the server and the screens. Labels are English keys, translated on screen.
 */
export const AUDIENCES = [
  ['executives', 'Business owners and executives', 'Founders, C-suite and decision makers across the UAE.'],
  ['affluent_expats', 'Affluent expats', 'High-income expatriate professionals and families.'],
  ['arabic_families', 'Arabic-speaking families', 'Emirati and Arab households, Arabic-first media.'],
  ['commuters', 'Drive-time commuters', 'People on the road in the morning and evening rush.'],
  ['property_investors', 'Property investors', 'Buyers and investors following UAE real estate.'],
  ['young_professionals', 'Young professionals', 'Working adults aged 22 to 35 building their careers.'],
  ['students', 'Students', 'University and college students.'],
  ['parents', 'Parents', 'Mothers and fathers making family decisions.'],
  ['tech_adopters', 'Tech early adopters', 'People who buy new gadgets, apps and services first.'],
  ['luxury_shoppers', 'Luxury shoppers', 'High spenders on fashion, cars, jewellery and travel.'],
  ['south_asian_community', 'South Asian community', 'Hindi, Urdu and Malayalam-speaking residents.'],
  ['sports_fans', 'Sports fans', 'Followers of football, cricket and motorsport.'],
] as const
export type Audience = typeof AUDIENCES[number][0]
export const AUDIENCE_KEYS = AUDIENCES.map(a => a[0]) as string[]
export const audienceLabel = (k: string) => AUDIENCES.find(a => a[0] === k)?.[1] ?? k
