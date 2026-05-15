import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { parseDateRange } from '@/lib/server/dashboard'
import {
  assertOrgAccessBySlugOrResponse,
  resolveOrgScopedProjectIds,
} from '@/lib/server/dashboard-route-helper'
import { mapSkillRow, type RawSkillRow } from '@/lib/server/dashboard-row-mapping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/orgs/:orgSlug/dashboard/skills?from=&to=&projectId=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth
    const { orgSlug } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
    if (access instanceof NextResponse) return access

    const projectIdParam = req.nextUrl.searchParams.get('projectId')
    const projectIds = await resolveOrgScopedProjectIds(access.org.id, userId, access.role, projectIdParam)
    if (projectIds instanceof NextResponse) return projectIds

    const fromQuery = req.nextUrl.searchParams.get('from') ?? undefined
    const toQuery = req.nextUrl.searchParams.get('to') ?? undefined
    const { from, to } = parseDateRange(fromQuery, toQuery)

    if (projectIds.length === 0) {
      return NextResponse.json({ skills: [] })
    }

    const skills = await db.$queryRaw<RawSkillRow[]>`
      WITH event_skill_calls AS (
        SELECT
          skill_name,
          session_id,
          user_id,
          timestamp,
          events.project_id AS project_id
        FROM events
        WHERE is_skill_call = true
          AND project_id = ANY(${projectIds}::text[])
          AND skill_name IS NOT NULL
          AND timestamp >= ${from}
          AND timestamp <= ${to}
      ),
      message_slash_calls AS (
        SELECT
          slash_match.match[1] AS skill_name,
          m.session_id,
          s.user_id,
          m.timestamp,
          s.project_id AS project_id
        FROM messages m
        JOIN claude_sessions s ON s.id = m.session_id
        CROSS JOIN LATERAL regexp_matches(
          m.content,
          '<command-message>[^<]*</command-message>[[:space:]]*<command-name>/?([^<[:space:]]+)</command-name>',
          'g'
        ) AS slash_match(match)
        WHERE m.role = 'HUMAN'
          AND s.project_id = ANY(${projectIds}::text[])
          AND m.timestamp >= ${from}
          AND m.timestamp <= ${to}
          AND NOT EXISTS (
            SELECT 1
            FROM events e
            WHERE e.session_id = m.session_id
              AND e.is_skill_call = true
              AND e.is_slash_command = true
              AND e.skill_name = slash_match.match[1]
          )
      ),
      -- all_skill_calls: union CTE 를 독립 CTE 로 승격 — skill_events 와 skill_project_aggregates 가 공유하므로 union 중복 실행 방지 (ADR-023)
      all_skill_calls AS (
        SELECT * FROM event_skill_calls
        UNION ALL
        SELECT * FROM message_slash_calls
      ),
      skill_events AS (
        SELECT
          skill_name,
          COUNT(*)                   AS call_count,
          COUNT(DISTINCT session_id) AS session_count,
          COUNT(DISTINCT user_id)    AS user_count,
          MAX(timestamp)             AS last_used_at
        FROM all_skill_calls
        GROUP BY skill_name
      ),
      skill_durations AS (
        SELECT
          m.tool_input->>'skill'                                        AS skill_name,
          COUNT(m.duration_ms)                                          AS duration_sample_count,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY m.duration_ms)   AS median_duration_ms
        FROM messages m
        JOIN claude_sessions s ON s.id = m.session_id
        WHERE m.tool_name = 'Skill'
          AND s.project_id = ANY(${projectIds}::text[])
          AND m.role = 'TOOL'
          AND m.duration_ms IS NOT NULL
          AND m.timestamp >= ${from}
          AND m.timestamp <= ${to}
        GROUP BY m.tool_input->>'skill'
      ),
      -- skill_project_aggregates: skill+project 차원 집계. 다중 권한 가드 (G4·M2):
      --   1) all_skill_calls base 가 이미 project_id = ANY(projectIds) 필터
      --   2) WHERE 절에서 redundant 하지만 명시적으로 재가드
      --   3) JOIN projects 에 p.org_id 가드로 org 격리
      skill_project_aggregates AS (
        SELECT
          sc.skill_name,
          sc.project_id,
          p.name AS project_name,
          COUNT(*) AS invocations,
          MAX(sc.timestamp) AS last_used_at
        FROM all_skill_calls sc
        JOIN projects p
          ON p.id = sc.project_id
         AND p.org_id = ${access.org.id}
        WHERE sc.project_id = ANY(${projectIds}::text[])
        GROUP BY sc.skill_name, sc.project_id, p.name
      ),
      -- skill_project_ranked: ROW_NUMBER() window function 으로 skill 별 invocations Top 순위 매기기 (ADR-023)
      --   tiebreaker: invocations DESC, project_name ASC, project_id ASC (ADR-024 결정적 정렬)
      skill_project_ranked AS (
        SELECT
          skill_name,
          project_id,
          project_name,
          invocations,
          last_used_at,
          ROW_NUMBER() OVER (
            PARTITION BY skill_name
            ORDER BY invocations DESC, project_name ASC, project_id ASC
          ) AS rn
        FROM skill_project_aggregates
      ),
      -- skill_project_breakdown: Top 5 를 json_agg + FILTER 로 배열화, total_project_count 로 additionalProjectCount 계산 기반 제공 (ADR-029)
      --   to_char(...AT TIME ZONE 'UTC', ...) 로 timestamptz → ISO8601 UTC 문자열 변환 (mapper 에서 Date 가정 제거)
      --   COALESCE('[]'::json) 로 skill 에 project 0개일 때도 non-null 보장
      skill_project_breakdown AS (
        SELECT
          skill_name,
          COALESCE(
            json_agg(
              json_build_object(
                'projectId',   project_id,
                'projectName', project_name,
                'invocations', invocations,
                'lastUsedAt',  to_char(
                                 last_used_at AT TIME ZONE 'UTC',
                                 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                               )
              ) ORDER BY invocations DESC, project_name ASC, project_id ASC
            ) FILTER (WHERE rn <= 5),
            '[]'::json
          ) AS projects_json,
          COUNT(*) AS total_project_count
        FROM skill_project_ranked
        GROUP BY skill_name
      )
      SELECT
        e.skill_name,
        e.call_count,
        e.session_count,
        e.user_count,
        e.last_used_at,
        d.median_duration_ms,
        d.duration_sample_count,
        -- LEFT JOIN miss 대비 COALESCE 로 non-null 보장 (WU-2 mapper 방어 로직과 협약)
        COALESCE(b.projects_json, '[]'::json)   AS projects_json,
        COALESCE(b.total_project_count, 0)       AS total_project_count
      FROM skill_events e
      LEFT JOIN skill_durations d USING (skill_name)
      LEFT JOIN skill_project_breakdown b USING (skill_name)
      ORDER BY e.call_count DESC, e.skill_name ASC
      LIMIT 50
    `

    return NextResponse.json({ skills: skills.map(mapSkillRow) })
  } catch (err) {
    return handleRouteError(err)
  }
}
