// Sign-in details for the four demo accounts on a demo server. Real accounts (the owner, invited companies) are never touched.
//   tsx scripts/demo-credentials.ts                  new random password for the demo accounts and a new staff authenticator key
//   DEMO_PASSWORD='…' tsx scripts/demo-credentials.ts  set this password for all four demo accounts; the staff key is kept
import { pool } from '../server/core/db.js'
import { hashPassword, newTotpSecret, randomToken } from '../server/auth/crypto.js'

export const DEMO_ACCOUNTS = ['demo@northwind.ae', 'sales@skyline.ae', 'ops@nashr.ae', 'omar@nashr.ae']
const chosen = process.env.DEMO_PASSWORD
if (chosen !== undefined && chosen.length < 12) { console.error('Use a password of at least 12 characters.'); process.exit(2) }

const password = chosen ?? randomToken().slice(0, 16)
const ids = (await pool.query(`update users set password_hash = $1 where lower(email) = any($2) returning id, email`, [hashPassword(password), DEMO_ACCOUNTS])).rows
await pool.query(`delete from sessions where user_id = any($1)`, [ids.map(r => r.id)])
let key: string | null = null
if (chosen === undefined) {
  key = newTotpSecret()
  await pool.query(`update users set totp_secret = $1, totp_last_step = null where totp_enabled and lower(email) = any($2)`, [key, DEMO_ACCOUNTS])
}
await pool.end()
if (chosen !== undefined) console.log(`Demo password set for: ${ids.map(r => r.email).join(', ')}. Staff still sign in with their authenticator code.`)
else console.log(`Demo password for every account: ${password}\nStaff authenticator key: ${key}`)
