import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Where file bytes live. The files table decides who may read them; storage only keeps bytes. */
export interface Storage { put(key: string, bytes: Buffer): Promise<void>; get(key: string): Promise<Buffer> }

// ponytail: local disk for development and tests. Production swaps in S3 (private bucket, presigned uploads for large video).
export class DiskStorage implements Storage {
  constructor(private dir = process.env.FILES_DIR ?? '.files') {}
  async put(key: string, bytes: Buffer) { await mkdir(this.dir, { recursive: true }); await writeFile(join(this.dir, key), bytes) }
  get(key: string) { return readFile(join(this.dir, key)) }
}

/**
 * The file's real type from its first bytes (security review F2). What the uploader claims is never trusted: a file we
 * cannot recognise is stored as application/octet-stream, which no channel accepts as creative.
 */
export function sniffType(b: Buffer): string {
  const at = (i: number, s: string) => b.subarray(i, i + s.length).toString('latin1') === s
  if (at(0, '%PDF')) return 'application/pdf'
  if (at(0, '\x89PNG')) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (at(0, 'GIF8')) return 'image/gif'
  if (at(0, 'PK\x03\x04')) return 'application/zip'
  if (at(4, 'ftyp')) return at(8, 'qt  ') ? 'video/quicktime' : 'video/mp4'
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'audio/wav'
  if (at(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg'
  return 'application/octet-stream'
}
