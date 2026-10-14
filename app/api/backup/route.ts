import { route } from '@/server/http'
import { markBackedUp } from '@/server/services/admin'

/** Called when the internet is back: everything logged so far has reached the off-site copy. */
export const POST = route({}, ({ tx }) => markBackedUp(tx))
