import net from 'node:net'
import tls from 'node:tls'
import { randomBytes } from 'node:crypto'

/*
 * A small SMTP client of our own (no library): connect, STARTTLS (or TLS from the start on port 465), sign in, send one
 * message, quit. Messages are MIME multipart with a plain-text and an HTML part, UTF-8 throughout so Arabic arrives intact.
 * Settings come from the environment (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM); without them nothing is sent.
 */
export type SmtpConfig = { host: string; port: number; user?: string; pass?: string; from: string; implicitTls: boolean; rejectUnauthorized: boolean }

export function smtpConfig(env = process.env): SmtpConfig | null {
  if (!env.SMTP_HOST || !env.SMTP_FROM) return null
  const port = Number(env.SMTP_PORT || 587)
  return { host: env.SMTP_HOST, port, user: env.SMTP_USER || undefined, pass: env.SMTP_PASS || undefined, from: env.SMTP_FROM,
    implicitTls: env.SMTP_SECURE ? env.SMTP_SECURE === 'tls' : port === 465, rejectUnauthorized: env.SMTP_TLS_INSECURE !== 'yes' }
}

export type Mail = { to: string; subject: string; text: string; html: string; lang?: 'en' | 'ar' }

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n')
const header = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
const address = (from: string) => from.match(/<([^>]+)>/)?.[1] ?? from.trim()
const named = (from: string) => { const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/); return m ? `${header(m[1])} <${m[2]}>` : from }

/** The message as it goes on the wire: headers, then a text and an HTML part, base64 so long Arabic lines are safe. */
export function buildMessage(cfg: Pick<SmtpConfig, 'from'>, m: Mail, at = new Date()) {
  const boundary = `nashr-${randomBytes(12).toString('hex')}`, domain = address(cfg.from).split('@')[1] ?? 'nashr.local'
  const id = `<${randomBytes(16).toString('hex')}@${domain}>`
  const lines = [
    `From: ${named(cfg.from)}`, `To: <${m.to}>`, `Subject: ${header(m.subject)}`, `Date: ${at.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${id}`, 'MIME-Version: 1.0', ...(m.lang ? [`Content-Language: ${m.lang}`] : []), 'Auto-Submitted: auto-generated',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.html),
    `--${boundary}--`, '']
  return { id, data: lines.join('\r\n') }
}

/** Send one message. Resolves with the Message-ID; rejects with the server's reply when something is refused. */
export async function sendMail(cfg: SmtpConfig, m: Mail, timeoutMs = 20_000): Promise<string> {
  if (/[\r\n<>]/.test(m.to)) throw new Error('Bad recipient address')
  let socket: net.Socket = cfg.implicitTls
    ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized })
    : net.connect({ host: cfg.host, port: cfg.port })
  socket.setTimeout(timeoutMs)
  let buffer = '', waiting: ((line: string) => void) | null = null, failed: Error | null = null
  const replies: string[] = []
  const attach = (s: net.Socket) => {
    s.setEncoding('utf8')
    s.on('data', (chunk: string) => {
      buffer += chunk
      let i: number
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 2)
        replies.push(line)
        if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) { const all = replies.splice(0).join('\n'); const w = waiting; waiting = null; w?.(all) }
      }
    })
    s.on('timeout', () => { failed = new Error('SMTP timed out'); s.destroy() })
    s.on('error', e => { failed = e })
    s.on('close', () => { const w = waiting; waiting = null; w?.(`000 ${failed?.message ?? 'connection closed'}`) })
  }
  attach(socket)
  const reply = () => new Promise<string>(r => { waiting = r })
  const expect = async (codes: number[], what: string) => {
    const r = await reply(), code = Number(r.split('\n').at(-1)!.slice(0, 3)) // the last line of a reply carries its code
    if (!codes.includes(code)) throw new Error(`SMTP ${what}: ${r.split('\n').at(-1)}`)
    return r
  }
  const send = (line: string) => socket.write(line + '\r\n')
  try {
    if (!cfg.implicitTls) await new Promise<void>((ok, no) => { socket.once('connect', ok); socket.once('error', no) })
    await expect([220], 'greeting')
    const me = 'nashr'
    send(`EHLO ${me}`); let ehlo = await expect([250], 'EHLO')
    if (!cfg.implicitTls && /STARTTLS/i.test(ehlo)) {
      send('STARTTLS'); await expect([220], 'STARTTLS')
      socket.removeAllListeners('data'); socket.removeAllListeners('close'); socket.removeAllListeners('timeout'); socket.removeAllListeners('error')
      socket = tls.connect({ socket, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized })
      socket.setTimeout(timeoutMs); attach(socket)
      await new Promise<void>((ok, no) => { socket.once('secureConnect', ok); socket.once('error', no) })
      send(`EHLO ${me}`); ehlo = await expect([250], 'EHLO')
    } else if (!cfg.implicitTls && cfg.user && !/^(localhost|127\.0\.0\.1)$/.test(cfg.host)) {
      throw new Error('SMTP server does not offer STARTTLS: refusing to send the password unencrypted')
    }
    if (cfg.user) {
      send(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass ?? ''}`).toString('base64')}`)
      await expect([235], 'sign-in')
    }
    const { id, data } = buildMessage(cfg, m)
    send(`MAIL FROM:<${address(cfg.from)}>`); await expect([250], 'MAIL FROM')
    send(`RCPT TO:<${m.to}>`); await expect([250, 251], 'RCPT TO')
    send('DATA'); await expect([354], 'DATA')
    socket.write(data.replace(/\r\n\./g, '\r\n..') + '\r\n.\r\n') // dot-stuffing, then the end of the message
    await expect([250], 'message')
    send('QUIT'); await reply().catch(() => '')
    return id
  } finally { socket.destroy() }
}
