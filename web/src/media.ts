import { MEDIA, MEDIA_LABEL, family } from '../../server/shared/media'
import { t } from './i18n'

/** The media types, in the order screens list them, with their names in the reader's language (shared list: server/shared/media.ts). */
export const CHANNELS = MEDIA
export const CHANNEL_NAME: Record<string, string> = { ...Object.fromEntries(MEDIA.map(m => [m, t(MEDIA_LABEL[m])])), print: t('Newspaper') }
/** One icon path per type (24 × 24, stroked). */
export const ICON: Record<string, string> = {
  // each media type has its own picture (owner's fixes round 2): globe, newspaper, open book, envelope, radio, TV set, microphone, @, three dots
  digital: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z',
  newspaper: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 12.5h5M8 16h3', print: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 12.5h5M8 16h3',
  magazine: 'M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2zM12 6.5v13',
  newsletter: 'M3 6h18v12H3zM3 7l9 6 9-6',
  radio: 'M4 9h16v11H4zM8 9l9-5M8 14.5h.01M12 13h5M12 16h5',
  tv: 'M4 8h16v11H4zM8 22h8M9 3.5l3 4.5 3-4.5',
  podcast: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  social: 'M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.6 7.2',
  other: 'M5 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 0 0-2.4 0zM10.8 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 0 0-2.4 0zM16.6 12a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 0 0-2.4 0z',
}
/** The stock photo for a type (newer types use their family's photo). */
export const art = (c: string, size: 'wide' | 'card' | '' = 'wide') => `/brand/${family(c)}${size ? `-${size}` : ''}.jpg`
