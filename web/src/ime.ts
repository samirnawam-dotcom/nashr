import type { KeyboardEvent } from 'react'

/**
 * True while a keyboard's input method is still composing a word (Japanese, Chinese, Korean, some phone keyboards):
 * that Enter confirms the word and must not send or pick anything. Safari reports the confirming Enter late, with
 * isComposing already false, so keyCode 229 (the composing key) catches it too.
 */
export const composing = (e: KeyboardEvent) => e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229
