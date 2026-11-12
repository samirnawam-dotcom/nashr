import { isAr } from './i18n'
import { arabicFor } from './server-text'

// The dictionary and the translation live in server-text.ts (no browser code), so the server's Arabic PDFs use them too.
export { SERVER_AR } from './server-text'

/** A message from the server, in the reader's language. */
export const tm = (msg: string | null | undefined): string => !msg ? '' : isAr ? arabicFor(msg) : msg

/** A title such as "The National · Full page": each part in the reader's language where it is one of ours (a format, "Break 2"); names stay as written. */
export const tmTitle = (title: string | null | undefined): string => !title ? '' : isAr ? title.split(' · ').map(x => arabicFor(x)).join(' · ') : title
