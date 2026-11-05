// Creates a Nashr staff account and prints its one-time invite link (valid 7 days).
// The person opens the link, sets their own password and links their own authenticator app.
//   tsx scripts/invite-staff.ts <email> "<full name>" [founder|admin] [https://app.origin]
import { pool, tx } from '../server/core/db.js'
import { inviteStaff } from '../server/auth/access.js'

const [email, name, role = 'founder', origin = 'https://nashr.restbits.online'] = process.argv.slice(2)
if (!email?.includes('@') || !name || !['founder', 'admin'].includes(role)) {
  console.error('Usage: tsx scripts/invite-staff.ts <email> "<full name>" [founder|admin] [https://app.origin]')
  process.exit(2)
}
// The usage examples (owner@example.com, "Full Name", their.real@email.com) are not real people: refuse them.
if (/@(example\.(com|org|net)|email\.com)$/i.test(email) || /^(owner|their\.real|you|name)@/i.test(email) || /\b(full|real|owner) name\b/i.test(name)) {
  console.error(`"${email}" / "${name}" looks like the example from the instructions. Use the person's real email and name.`)
  process.exit(2)
}
const taken = (await pool.query(`select 1 from users where lower(email) = lower($1)`, [email])).rows.length > 0
if (taken) { console.error(`${email} already has an account.`); await pool.end(); process.exit(1) }

const { inviteToken } = await tx(db => inviteStaff(db, { email, name, role: role as 'founder' | 'admin' }, 'cli:invite-staff', new Date()))
await pool.end()
console.log(`${role} account created for ${name} <${email}>.\nInvite link (one use, valid 7 days):\n${origin.replace(/\/$/, '')}/invite#${inviteToken}`)
