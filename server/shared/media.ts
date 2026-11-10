/**
 * The media types an outlet can be (owner's list, November 2026): one list for the server and every screen. Newspaper and magazine
 * follow the print rules (PDF artwork, a tearsheet as proof); newsletter and social follow the website rules with their own proof.
 * Keys are stored on outlets; "digital" is the website (kept as the key so existing outlets and saved searches keep working).
 */
export const MEDIA = ['digital', 'newspaper', 'magazine', 'newsletter', 'radio', 'tv', 'podcast', 'social', 'other'] as const
export type Media = typeof MEDIA[number]
export const MEDIA_LABEL: Record<string, string> = {
  digital: 'Website', newspaper: 'Newspaper', magazine: 'Magazine', newsletter: 'Newsletter', radio: 'Radio', tv: 'TV / Shows', podcast: 'Podcast', social: 'Social media', other: 'Other',
}
/** The older type a newer one follows for file rules and photos. */
export const family = (m: string) => m === 'newspaper' || m === 'magazine' || m === 'print' ? 'print' : m === 'newsletter' || m === 'social' || m === 'other' ? 'digital' : m
