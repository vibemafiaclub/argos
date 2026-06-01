import type { SkillStat, AgentStat } from '@argos/shared'

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

export function mapSkillRow(row: RawSkillRow): SkillStat {
  const sampleCount = row.duration_sample_count != null ? Number(row.duration_sample_count) : 0
  return {
    skillName: row.skill_name,
    callCount: Number(row.call_count),
    sessionCount: Number(row.session_count),
    userCount: Number(row.user_count),
    lastUsedAt: row.last_used_at.toISOString(),
    medianDurationMs: sampleCount >= DURATION_SAMPLE_THRESHOLD ? row.median_duration_ms : null,
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
