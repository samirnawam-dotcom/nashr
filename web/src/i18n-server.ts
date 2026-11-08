import { isAr } from './i18n'
import { arabicFor } from './server-text'

// The dictionary and the translation live in server-text.ts (no browser code), so the server's Arabic PDFs use them too.
export { SERVER_AR } from './server-text'

/** A message from the server, in the reader's language. */
export const tm = (msg: string | null | undefined): string => !msg ? '' : isAr ? arabicFor(msg) : msg
