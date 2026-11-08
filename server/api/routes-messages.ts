import { canWrite, conversations, hasThread, dealFor, markRead, send, thread, unreadCount } from '../messaging/messages.js'
import { NotFound, type RouteFn } from './app.js'

export function messageRoutes(route: RouteFn) {
  // Both sides of a booking read and write the same conversation; opening it marks it read.
  route('GET', '/api/deals/:id/messages', ['buyer', 'seller'], async ({ db, at, me }, req) => {
    const d = await dealFor(db, req.params.id, me.actAs.companyId)
    if (!d) throw new NotFound()
    if (me.actAs.companyId === me.companyId && !me.signedInAs) await markRead(db, d.id, me.actAs.companyId, at) // an admin viewing as the company doesn't mark it read
    return { open: hasThread(d.status), canWrite: canWrite(d.status), messages: await thread(db, d.id, me.actAs.companyId) }
  })
  route('POST', '/api/deals/:id/messages', ['buyer', 'seller'], async ({ db, at, me }, req) => {
    const d = await dealFor(db, req.params.id, me.actAs.companyId)
    if (!d) throw new NotFound()
    await send(db, d, me.actAs.companyId, me.userId, req.body.body, at)
    return { open: true, canWrite: true, messages: await thread(db, d.id, me.actAs.companyId) }
  }, { type: 'object', required: ['body'], additionalProperties: false, properties: { body: { type: 'string', minLength: 1, maxLength: 2000 } } })

  route('GET', '/api/messages', ['buyer', 'seller'], async ({ db, me }) => conversations(db, me.actAs.companyId))
  route('GET', '/api/messages/unread', ['buyer', 'seller'], async ({ db, me }) => ({ count: await unreadCount(db, me.actAs.companyId) }))

  // The team reads a booking's conversation, with flagged messages marked.
  route('GET', '/api/admin/deals/:id/messages', ['admin'], async ({ db }, req) => thread(db, req.params.id, null))
}
