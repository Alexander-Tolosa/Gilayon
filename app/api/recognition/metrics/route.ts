import { route } from '@/server/http'
import { recognitionMetrics } from '@/server/services/recognition'

export const GET = route({ read: true }, async ({ tx }) => recognitionMetrics(tx))
