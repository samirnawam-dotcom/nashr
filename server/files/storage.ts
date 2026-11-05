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
