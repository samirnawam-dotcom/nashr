// Gives a public demo server its own sign-in details, so the demo password and staff key
// published in the README cannot be used on it. Prints the new password and staff authenticator key once.
import { pool } from '../server/core/db.js'
import { hashPassword, newTotpSecret, randomToken } from '../server/auth/crypto.js'

const password = randomToken().slice(0, 16)
const totp = newTotpSecret()
await pool.query(`update users set password_hash = $1`, [hashPassword(password)])
await pool.query(`update users set totp_secret = $1, totp_last_step = null where totp_enabled`, [totp])
await pool.query(`delete from sessions`)
await pool.end()
console.log(`Demo password for every account: ${password}\nStaff authenticator key: ${totp}`)
