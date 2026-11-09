// Tag the demo outlets with their audiences on a server seeded before they were added (safe to run again).
//   DATABASE_URL=... npx tsx scripts/demo-audiences.ts
import { pool } from '../server/core/db.js'
import { applyDemoAudiences } from '../server/demo-audiences.js'

console.log(`Demo outlets tagged: ${await applyDemoAudiences(pool)}`)
await pool.end()
