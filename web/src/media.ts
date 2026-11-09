import { MEDIA, MEDIA_LABEL, family } from '../../server/shared/media'
import { t } from './i18n'

/** The media types, in the order screens list them, with their names in the reader's language (shared list: server/shared/media.ts). */
export const CHANNELS = MEDIA
export const CHANNEL_NAME: Record<string, string> = { ...Object.fromEntries(MEDIA.map(m => [m, t(MEDIA_LABEL[m])])), print: t('Newspaper') }
/** One icon path per type (24 × 24, stroked). */
export const ICON: Record<string, string> = {
  radio: 'M4 9h16v11H4zM8 9l9-5M8 14.5h.01M12 13h5M12 16h5', tv: 'M3 6h18v12H3zM8 21h8M12 18v3',
  newspaper: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4', print: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4',
  magazine: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM9 8h6M9 12h6', digital: 'M3 5h18v11H3zM9 20h6M12 16v4',
  newsletter: 'M3 6h18v12H3zM3 7l9 6 9-6', podcast: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  social: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM16.5 7.5h.01',
}
/** The stock photo for a type (newer types use their family's photo). */
export const art = (c: string, size: 'wide' | 'card' | '' = 'wide') => `/brand/${family(c)}${size ? `-${size}` : ''}.jpg`
