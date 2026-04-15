import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { errorHandler } from '@/middleware/error'
import health from '@/routes/health'
import auth from '@/routes/auth'
import orgs from '@/routes/orgs'
import projects from '@/routes/projects'
import events from '@/routes/events'
import dashboard from '@/routes/dashboard'
import { env } from '@/env'

const app = new Hono()

const allowedOrigins = env.WEB_URL.split(',').map((u) => u.trim())
app.use('*', cors({ origin: allowedOrigins }))
app.use('*', logger())
app.onError(errorHandler)

app.route('/health', health)
app.route('/api/auth', auth)
app.route('/api/orgs', orgs)
app.route('/api/projects', projects)
app.route('/api/projects/:projectId/dashboard', dashboard)
app.route('/api/events', events)

export default app
