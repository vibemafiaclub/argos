import type { SkillStat, AgentStat, SkillProjectEntry } from '@argos/shared'

// 휴리스틱. methodology 페이지에도 동일 숫자 하드코딩됨.
export const DURATION_SAMPLE_THRESHOLD = 3

export interface RawSkillRow {
  skill_name: string
  call_count: bigint
  session_count: bigint
  user_count: bigint
  last_used_at: Date
  median_duration_ms: number | null
  duration_sample_count: bigint | null
  /**
   * Postgres json_agg(...) 결과. SQL(WU-3)이 COALESCE('[]'::json) 로 non-null 을 보장하지만
   * mapper 는 방어적으로 null / non-array 를 빈 배열로 폴백한다.
   */
  projects_json: unknown
  /**
   * 해당 skill 의 distinct project 총수. SQL(WU-3)이 COALESCE(0) 로 non-null 을 보장한다.
   */
  total_project_count: bigint
}

export interface RawAgentRow {
  agent_type: string
  call_count: bigint
  session_count: bigint
  user_count: bigint
  last_used_at: Date
  sample_desc: string | null
  median_duration_ms: number | null
  duration_sample_count: bigint | null
}

/**
 * projects_json(Postgres json_agg 결과)을 SkillProjectEntry[] 로 파싱한다.
 * - null / non-array → 빈 배열 폴백 (M3 — 분포 깨지지 않음)
 * - 각 element 의 shape 체크: projectId/projectName(string), invocations(number), lastUsedAt(string)
 * - 잘못된 shape 의 element 는 배열에서 제외(throw 하지 않음)
 */
function parseProjectsJson(raw: unknown): SkillProjectEntry[] {
  if (!Array.isArray(raw)) return []

  const result: SkillProjectEntry[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const { projectId, projectName, invocations, lastUsedAt } = item as Record<string, unknown>
    if (typeof projectId !== 'string') continue
    if (typeof projectName !== 'string') continue
    if (typeof invocations !== 'number') continue
    const lastUsedAtStr =
      typeof lastUsedAt === 'string'
        ? lastUsedAt
        : lastUsedAt instanceof Date
          ? lastUsedAt.toISOString()
          : null
    if (lastUsedAtStr === null) continue
    result.push({ projectId, projectName, invocations, lastUsedAt: lastUsedAtStr })
  }
  return result
}

export function mapSkillRow(row: RawSkillRow): SkillStat {
  const sampleCount = row.duration_sample_count != null ? Number(row.duration_sample_count) : 0
  const projects = parseProjectsJson(row.projects_json)
  const totalProjectCount = row.total_project_count != null ? Number(row.total_project_count) : 0
  const additionalProjectCount = Math.max(0, totalProjectCount - projects.length)
  return {
    skillName: row.skill_name,
    callCount: Number(row.call_count),
    sessionCount: Number(row.session_count),
    userCount: Number(row.user_count),
    lastUsedAt: row.last_used_at.toISOString(),
    medianDurationMs: sampleCount >= DURATION_SAMPLE_THRESHOLD ? row.median_duration_ms : null,
    projects,
    additionalProjectCount,
  }
}

export function mapAgentRow(row: RawAgentRow): AgentStat {
  const sampleCount = row.duration_sample_count != null ? Number(row.duration_sample_count) : 0
  return {
    agentType: row.agent_type,
    callCount: Number(row.call_count),
    sessionCount: Number(row.session_count),
    userCount: Number(row.user_count),
    lastUsedAt: row.last_used_at.toISOString(),
    sampleDesc: row.sample_desc,
    medianDurationMs: sampleCount >= DURATION_SAMPLE_THRESHOLD ? row.median_duration_ms : null,
  }
}
