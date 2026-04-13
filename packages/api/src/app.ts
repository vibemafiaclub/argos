import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { errorHandler } from '@/middleware/error'
import health from '@/routes/health'
import { env } from '@/env'

const app = new Hono()

app.use('*', cors({ origin: env.WEB_URL }))
app.use('*', logger())
app.onError(errorHandler)

app.route('/health', health)
// TODO: 이후 phase에서 라우트 추가

export default app
