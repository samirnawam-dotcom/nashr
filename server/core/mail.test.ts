import { afterEach, beforeEach, expect, test } from 'vitest'
import net from 'node:net'
import { pool } from './db.js'
import { notify } from './notify.js'
import { runOutbox } from './mail.js'
import { buildMessage, sendMail } from './smtp.js'
import { T, company, reset } from '../test/helpers.js'

const now = T('2026-11-01T08:00:00Z')

/** A tiny SMTP server for tests: speaks just enough of the protocol and keeps what it receives. */
function fakeSmtp(opts: { refuseRcpt?: boolean } = {}) {
  const got: string[] = []
  const server = net.createServer(s => {
    s.setEncoding('utf8'); let data = false, buf = ''
    s.write('220 fake ready\r\n')
    s.on('data', (chunk: string) => {
      buf += chunk
      if (data) { const end = buf.indexOf('\r\n.\r\n'); if (end < 0) return; got.push(buf.slice(0, end)); buf = buf.slice(end + 5); data = false; s.write('250 queued as 1\r\n'); return }
      let i; while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2)
        if (/^EHLO/.test(line)) s.write('250-fake\r\n250 8BITMIME\r\n')
        else if (/^MAIL FROM/.test(line)) s.write('250 ok\r\n')
        else if (/^RCPT TO/.test(line)) s.write(opts.refuseRcpt ? '550 no such user\r\n' : '250 ok\r\n')
        else if (line === 'DATA') { s.write('354 go ahead\r\n'); data = true; if (buf) s.emit('data', '') }
        else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end() }
        else s.write('500 what\r\n')
      }
    })
  })
  return new Promise<{ port: number; got: string[]; close: () => void }>(ok => server.listen(0, '127.0.0.1', () => ok({ port: (server.address() as any).port, got, close: () => server.close() })))
}

const env = { ...process.env }
beforeEach(async () => { await reset(); delete process.env.SMTP_HOST; delete process.env.SMTP_FROM })
afterEach(() => { process.env = { ...env } })

test('a message is MIME with a text and an HTML part, UTF-8 subject, and lines starting with a dot are escaped', async () => {
  const smtp = await fakeSmtp()
  const id = await sendMail({ host: '127.0.0.1', port: smtp.port, from: 'Nashr <noreply@nashr.ae>', implicitTls: false, rejectUnauthorized: true },
    { to: 'sara@northwind.ae', subject: 'فاتورة جديدة', text: 'Line one\n.starts with a dot', html: '<p>مرحبا</p>' })
  smtp.close()
  expect(id).toMatch(/^<[0-9a-f]+@nashr\.ae>$/)
  const m = smtp.got[0]
  expect(m).toContain('Subject: =?UTF-8?B?')
  expect(m).toContain('multipart/alternative')
  expect(m).toContain('Content-Type: text/html; charset=UTF-8')
  const { data } = buildMessage({ from: 'Nashr <noreply@nashr.ae>' }, { to: 'a@b.ae', subject: 'x', text: '.', html: '.' })
  expect(data).toContain('From: Nashr <noreply@nashr.ae>')
})

test('a refused recipient is an error with the server\'s reason', async () => {
  const smtp = await fakeSmtp({ refuseRcpt: true })
  await expect(sendMail({ host: '127.0.0.1', port: smtp.port, from: 'noreply@nashr.ae', implicitTls: false, rejectUnauthorized: true },
    { to: 'nobody@northwind.ae', subject: 's', text: 't', html: 'h' })).rejects.toThrow('550 no such user')
  smtp.close()
})

test('without SMTP, emails are held in the outbox; choices are respected; each person gets their language', async () => {
  const c = await company('Northwind Fintech', 'buyer')
  await pool.query(`insert into users (company_id, email, name, role, status, created_at, lang, email_prefs) values
    ($1, 'sara@northwind.ae', 'Sara', 'buyer', 'active', now(), 'en', '{"bids": false}'), ($1, 'omar@northwind.ae', 'Omar', 'buyer', 'active', now(), 'ar', '{}')`, [c])
  await notify(pool, c, 'bid.outbid', null, { outlet: 'Skyline FM', label: 'Break 1', top: 400000 }, now)     // optional: only Omar wants bid emails
  await notify(pool, c, 'deal.awaiting_payment', null, null, now)                                             // essential: both
  const rows = (await pool.query(`select to_email, kind, status, subject, text_body from outbox order by created_at, to_email`)).rows
  expect(rows.map(r => `${r.kind} ${r.to_email} ${r.status}`)).toEqual(expect.arrayContaining([
    'bid.outbid omar@northwind.ae held', 'deal.awaiting_payment omar@northwind.ae held', 'deal.awaiting_payment sara@northwind.ae held']))
  expect(rows).toHaveLength(3)
  expect(rows.find(r => r.to_email === 'omar@northwind.ae' && r.kind === 'deal.awaiting_payment')!.text_body).toMatch(/[؀-ۿ]/) // Arabic
  expect(rows.find(r => r.to_email === 'sara@northwind.ae')!.subject).toBe('The publisher accepted. Pay to secure the slot.')
})

test('with SMTP set up, the worker sends what is due and retries a failure later', async () => {
  const smtp = await fakeSmtp()
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), SMTP_FROM: 'Nashr <noreply@nashr.ae>', SMTP_SECURE: 'starttls' })
  const c = await company('Northwind Fintech', 'buyer')
  await pool.query(`insert into users (company_id, email, name, role, status, created_at) values ($1, 'sara@northwind.ae', 'Sara', 'buyer', 'active', now())`, [c])
  await notify(pool, c, 'deal.secured', null, null, now)
  expect(await runOutbox(now)).toBe(1)
  expect((await pool.query(`select status, message_id from outbox`)).rows[0]).toMatchObject({ status: 'sent', message_id: expect.stringMatching(/^</) })
  expect(smtp.got).toHaveLength(1)
  await notify(pool, c, 'deal.secured', null, null, now)
  expect(await runOutbox(now, async () => { throw new Error('421 try later') })).toBe(1)
  const failed = (await pool.query(`select status, attempts, last_error, next_attempt_at from outbox where status <> 'sent'`)).rows[0]
  expect(failed).toMatchObject({ status: 'queued', attempts: 1, last_error: '421 try later' })
  expect(failed.next_attempt_at.getTime()).toBe(now.getTime() + 60_000)                                   // tried again in a minute
  smtp.close()
})
