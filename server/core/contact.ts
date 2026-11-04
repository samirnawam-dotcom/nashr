// Sellers and buyers talk only inside Nashr (brief section 6). Free text may not carry emails or phone numbers.
// ponytail: patterns catch the usual forms (Arabic-Indic digits, spacing, "at"/"dot"); determined people can still spell
// numbers out in words, which the review flag in messaging (D) is for.

const ARABIC_DIGITS = /[٠-٩۰-۹]/g
const toLatin = (s: string) => s.replace(ARABIC_DIGITS, d => String((d.charCodeAt(0) & 0xf) % 10))

const EMAIL = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\]|\sdot\s)\s*[a-z]{2,}/i
const PHONE = /(\+?\d[\d\s().-]{6,}\d)/ // 8+ digits with separators, e.g. +971 50 123 4567, 050-1234567

export function containsContactDetails(text: string | null | undefined) {
  if (!text) return false
  const t = toLatin(text)
  return EMAIL.test(t) || [...t.matchAll(new RegExp(PHONE, 'g'))].some(m => m[0].replace(/\D/g, '').length >= 8)
}
