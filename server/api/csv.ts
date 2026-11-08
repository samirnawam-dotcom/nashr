import type { FastifyReply } from 'fastify'

/** A CSV download for admin tables: quoted cells, a header row, UTF-8 with a BOM so Excel shows Arabic names correctly. */
export function sendCsv(reply: FastifyReply, name: string, header: string[], rows: unknown[][]) {
  const cell = (v: unknown) => {
    const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v)
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` // a leading = + - @ would run as a formula in a spreadsheet
  }
  reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${name}.csv"`).header('cache-control', 'no-store')
  return '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
