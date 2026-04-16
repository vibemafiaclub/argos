import { Hono } from 'hono'
import { db } from '@/db'
import { authMiddleware } from '@/middleware/auth'
import { assertProjectAccess, parseDateRange } from '@/lib/dashboard'
import type {
  DashboardSummary,
  UsageSeries,
  UserStat,
  SkillStat,
  AgentStat,
  SessionItem,
  SessionDetail
} from '@argos/shared'

type Variables = {
  userId: string
}

const dashboard = new Hono<{ Variables: Variables }>()

dashboard.use('*', authMiddleware)

// GET /api/projects/:projectId/dashboard/summary
dashboard.get('/summary', async (c) => {
  const userId = c.get('userId') as string
  const projectId = c.req.param('projectId')!

  try {
    await assertProjectAccess(projectId, userId)
  } catch (err) {
    const message = (err as Error).message
    if (message === 'Project not found') {
      return c.json({ error: 'Project not found' }, 404)
    }
    return c.json({ error: 'Forbidden' }, 403)
  }

  const fromQuery = c.req.query('from')
  const toQuery = c.req.query('to')
  const { from, to } = parseDateRange(fromQuery, toQuery)

  const [sessionCount, usageTotals, activeUsers, topSkills, topAgents] = await Promise.all([
    db.claudeSession.count({
      where: {
        projectId,
        startedAt: { gte: from, lte: to }
      }
    }),
    db.usageRecord.aggregate({
      where: {
        projectId,
        timestamp: { gte: from, lte: to }
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        estimatedCostUsd: true
      }
    }),
    db.usageRecord.groupBy({
      by: ['userId'],
      where: {
        projectId,
        timestamp: { gte: from, lte: to }
      }
    }).then(r => r.length),
    db.event.groupBy({
      by: ['skillName'],
      where: {
        projectId,
        isSkillCall: true,
        skillName: { not: null },
        timestamp: { gte: from, lte: to }
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    }),
    db.event.groupBy({
      by: ['agentType'],
      where: {
        projectId,
        isAgentCall: true,
        agentType: { not: null },
        timestamp: { gte: from, lte: to }
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    })
  ])

  const summary: DashboardSummary = {
    sessionCount,
    activeUserCount: activeUsers,
    totalInputTokens: usageTotals._sum.inputTokens ?? 0,
    totalOutputTokens: usageTotals._sum.outputTokens ?? 0,
    totalCacheReadTokens: usageTotals._sum.cacheReadTokens ?? 0,
    totalCacheCreationTokens: usageTotals._sum.cacheCreationTokens ?? 0,
    estimatedCostUsd: usageTotals._sum.estimatedCostUsd ?? 0,
    topSkills: topSkills.map(s => ({
      skillName: s.skillName!,
      callCount: s._count.id
    })),
    topAgents: topAgents.map(a => ({
      agentType: a.agentType!,
      callCount: a._count.id
    }))
  }

  return c.json(summary)
})

// GET /api/projects/:projectId/dashboard/usage
dashboard.get('/usage', async (c) => {
  const userId = c.get('userId') as string
  const projectId = c.req.param('projectId')!

  try {
    await assertProjectAccess(projectId, userId)
  } catch (err) {
    const message = (err as Error).message
    if (message === 'Project not found') {
      return c.json({ error: 'Project not found' }, 404)
    }
    return c.json({ error: 'Forbidden' }, 403)
  }

  const fromQuery = c.req.query('from')
  const toQuery = c.req.query('to')
  const { from, to } = parseDateRange(fromQuery, toQuery)

  const series = await db.$queryRaw<Array<{
    date: Date
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    estimatedCostUsd: number
  }>>`
    SELECT
      DATE_TRUNC('day', timestamp)::date AS date,
      SUM(input_tokens)::int            AS "inputTokens",
      SUM(output_tokens)::int           AS "outputTokens",
      SUM(cache_read_tokens)::int       AS "cacheReadTokens",
      COALESCE(SUM(estimated_cost_usd), 0) AS "estimatedCostUsd"
    FROM usage_records
    WHERE project_id = ${projectId}
      AND timestamp >= ${from}
      AND timestamp <= ${to}
    GROUP BY 1
    ORDER BY 1
  `

  const usageSeries: UsageSeries[] = series.map(s => ({
    date: s.date.toISOString().split('T')[0],
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    cacheReadTokens: s.cacheReadTokens,
    estimatedCostUsd: Number(s.estimatedCostUsd)
  }))

  return c.json({ series: usageSeries })
})

// GET /api/projects/:projectId/dashboard/users
dashboard.get('/users', async (c) => {
  const userId = c.get('userId') as string
  const projectId = c.req.param('projectId')!

  try {
    const { orgId } = await assertProjectAccess(projectId, userId)

    const fromQuery = c.req.query('from')
    const toQuery = c.req.query('to')
    const { from, to } = parseDateRange(fromQuery, toQuery)

    const users = await db.$queryRaw<Array<{
      id: string
      name: string
      avatar_url: string | null
      session_count: bigint
      input_tokens: bigint | null
      output_tokens: bigint | null
      cost_usd: number | null
      skill_calls: bigint
      agent_calls: bigint
    }>>`
      SELECT
        u.id,
        u.name,
        u.avatar_url,
        COUNT(DISTINCT s.id) AS session_count,
        SUM(ur.input_tokens) AS input_tokens,
        SUM(ur.output_tokens) AS output_tokens,
        SUM(ur.estimated_cost_usd) AS cost_usd,
        COUNT(CASE WHEN e.is_skill_call THEN 1 END) AS skill_calls,
        COUNT(CASE WHEN e.is_agent_call THEN 1 END) AS agent_calls
      FROM users u
      JOIN org_memberships om ON om.user_id = u.id AND om.org_id = ${orgId}
      LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.project_id = ${projectId}
        AND ur.timestamp BETWEEN ${from} AND ${to}
      LEFT JOIN claude_sessions s ON s.user_id = u.id AND s.project_id = ${projectId}
        AND s.started_at BETWEEN ${from} AND ${to}
      LEFT JOIN events e ON e.user_id = u.id AND e.project_id = ${projectId}
        AND e.timestamp BETWEEN ${from} AND ${to}
      GROUP BY u.id, u.name, u.avatar_url
    `

    const userStats: UserStat[] = users.map(u => ({
      userId: u.id,
      name: u.name,
      avatarUrl: u.avatar_url,
      sessionCount: Number(u.session_count),
      inputTokens: Number(u.input_tokens ?? 0),
      outputTokens: Number(u.output_tokens ?? 0),
      estimatedCostUsd: Number(u.cost_usd ?? 0),
      skillCalls: Number(u.skill_calls),
      agentCalls: Number(u.agent_calls)
    }))

    return c.json({ users: userStats })
  } catch (err) {
    const message = (err as Error).message
    if (message === 'Project not found') {
      return c.json({ error: 'Project not found' }, 404)
    }
    return c.json({ error: 'Forbidden' }, 403)
  }
})

// GET /api/projects/:projectId/dashboard/skills
dashboard.get('/skills', async (c) => {
  const userId = c.get('userId') as string
  const projectId = c.req.param('projectId')!

  try {
    await assertProjectAccess(projectId, userId)
  } catch (err) {
    const message = (err as Error).message
    if (message === 'Project not found') {
      return c.json({ error: 'Project not found' }, 404)
    }
    return c.json({ error: 'Forbidden' }, 403)
  }

  const fromQuery = c.req.query('from')
  const toQuery = c.req.query('to')
  const { from, to } = parseDateRange(fromQuery, toQuery)

  const skills = await db.$queryRaw<Array<{
    skill_name: string
    call_count: bigint
    slash_command_count: bigint
    last_used_at: Date
  }>>`
    SELECT
      skill_name,
      COUNT(*) AS call_count,
      COUNT(CASE WHEN is_slash_command THEN 1 END) AS slash_command_count,
      MAX(timestamp) AS last_used_at
    FROM events
    WHERE project_id = ${projectId}
      AND is_skill_call = true
      AND skill_name IS NOT NULL
      AND timestamp >= ${from}
      AND timestamp <= ${to}
    GROUP BY skill_name
    ORDER BY call_count DESC
    LIMIT 50
  `

  const skillStats: SkillStat[] = skills.map(s => ({
    skillName: s.skill_name,
    callCount: Number(s.call_count),
    slashCommandCount: Number(s.slash_command_count),
    lastUsedAt: s.last_used_at.toISOString()
  }))

  return c.json({ skills: skillStats })
})

// GET /api/projects/:projectId/dashboard/agents
dashboard.get('/agents', async (c) => {
  const userId = c.get('userId') as string
  const projectId = c.req.param('projectId')!

  try {
    await assertProjectAccess(projectId, userId)
  } catch (err) {
    const message = (err as Error).message
    if (message === 'Project not found') {
      return c.json({ error: 'Project not found' }, 404)
    }
    return c.json({ error: 'Forbidden' }, 403)
  }

  const fromQuery = c.req.query('from')
  const toQuery = c.req.query('to')
  const { from, to } = parseDateRange(fromQuery, toQuery)

  const agents = await db.$queryRaw<Array<{
    agent_type: string
    call_count: bigint
    sample_desc: string | null
  }>>`
    WITH agent_counts AS (
      SELECT
        agent_type,
        COUNT(*) AS call_count
      FROM events
      WHERE project_id = ${projectId}
        AND is_agent_call = true
        AND agent_type IS NOT NULL
        AND timestamp >= ${from}
        AND timestamp <= ${to}
      GROUP BY agent_type
    ),
    agent_samples AS (
      SELECT DISTINCT ON (agent_type)
        agent_type,
        agent_desc
      FROM events
      WHERE project_id = ${projectId}
        AND is_agent_call = true
        AND agent_type IS NOT NULL
        AND timestamp >= ${from}
        AND timestamp <= ${to}
      ORDER BY agent_type, timestamp DESC
    )
    SELECT
      ac.agent_type,
      ac.call_count,
      ags.agent_desc AS sample_desc
    FROM agent_counts ac
    LEFT JOIN agent_samples ags ON ags.agent_type = ac.agent_type
    ORDER BY ac.call_count DESC
    LIMIT 50
  `

  const agentStats: AgentStat[] = agents.map(a => ({
    agentType: a.agent_type,
    callCount: Number(a.call_count),
    sampleDesc: a.sample_desc
  }))

  return c.json({ agents: agentStats })
})

// GET /api/projects/:projectId/dashboard/sessions
dashboard.get('/sessions', async (c) => {
  const userId = c.get('userId') as string
  const projectId = c.req.param('projectId')!

  try {
    await assertProjectAccess(projectId, userId)
  } catch (err) {
    const message = (err as Error).message
    if (message === 'Project not found') {
      return c.json({ error: 'Project not found' }, 404)
    }
    return c.json({ error: 'Forbidden' }, 403)
  }

  const fromQuery = c.req.query('from')
  const toQuery = c.req.query('to')
  const { from, to } = parseDateRange(fromQuery, toQuery)

  const sessions = await db.claudeSession.findMany({
    where: {
      projectId,
      startedAt: { gte: from, lte: to }
    },
    include: {
      user: { select: { id: true, name: true } },
      usageRecords: {
        select: { inputTokens: true, outputTokens: true, estimatedCostUsd: true }
      },
      _count: { select: { events: true } }
    },
    orderBy: { startedAt: 'desc' },
    take: 100
  })

  const sessionItems: SessionItem[] = sessions.map(s => {
    const totalInput = s.usageRecords.reduce((sum, r) => sum + r.inputTokens, 0)
    const totalOutput = s.usageRecords.reduce((sum, r) => sum + r.outputTokens, 0)
    const totalCost = s.usageRecords.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)

    return {
      id: s.id,
      userId: s.user.id,
      userName: s.user.name,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      estimatedCostUsd: totalCost,
      eventCount: s._count.events
    }
  })

  return c.json({ sessions: sessionItems })
})

// GET /api/projects/:projectId/dashboard/sessions/:sessionId
dashboard.get('/sessions/:sessionId', async (c) => {
  const userId = c.get('userId') as string
  const projectId = c.req.param('projectId')!
  const sessionId = c.req.param('sessionId')

  try {
    await assertProjectAccess(projectId, userId)
  } catch (err) {
    const message = (err as Error).message
    if (message === 'Project not found') {
      return c.json({ error: 'Project not found' }, 404)
    }
    return c.json({ error: 'Forbidden' }, 403)
  }

  const session = await db.claudeSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { select: { id: true, name: true } },
      usageRecords: true,
      messages: { orderBy: { sequence: 'asc' } },
      _count: { select: { events: true } }
    }
  })

  if (!session || session.projectId !== projectId) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const totalInput = session.usageRecords.reduce((sum, r) => sum + r.inputTokens, 0)
  const totalOutput = session.usageRecords.reduce((sum, r) => sum + r.outputTokens, 0)
  const totalCost = session.usageRecords.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0)

  const detail: SessionDetail = {
    id: session.id,
    userId: session.user.id,
    userName: session.user.name,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    estimatedCostUsd: totalCost,
    eventCount: session._count.events,
    messages: session.messages.map(m => ({
      role: m.role as 'HUMAN' | 'ASSISTANT',
      content: m.content,
      sequence: m.sequence,
      timestamp: m.timestamp.toISOString()
    }))
  }

  return c.json(detail)
})

export default dashboard
