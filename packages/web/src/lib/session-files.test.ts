/**
 * session-files.test.ts — extractSessionFiles (세션 상세 "파일" 패널) 가드
 *
 * 타임라인 이벤트에서 수정/읽기 파일 목록을 뽑는 순수 변환 로직.
 * 분류(도구별)·집계(count/인덱스)·정렬(count desc → lastTimestamp desc)을 고정한다.
 */

import { describe, it, expect } from 'vitest'
import { extractSessionFiles } from './session-files'
import type { TimelineEvent, ToolEvent, MessageEvent } from './timeline-events'

function tool(overrides: Partial<ToolEvent> & { toolName: string }): ToolEvent {
  return {
    kind: 'tool',
    toolInput: null,
    content: '',
    durationMs: null,
    timestamp: '2026-06-01T12:00:00Z',
    sequence: 0,
    isSkillCall: false,
    skillName: null,
    isAgentCall: false,
    agentType: null,
    ...overrides,
  }
}

function message(): MessageEvent {
  return {
    kind: 'message',
    role: 'HUMAN',
    content: 'hi',
    timestamp: '2026-06-01T12:00:00Z',
    sequence: 0,
    outputTokens: 0,
    inputTokens: 0,
    estimatedCostUsd: 0,
    model: null,
  }
}

describe('extractSessionFiles — 분류', () => {
  it('Edit/Write/MultiEdit 는 modified, Read 는 read 로 분류한다', () => {
    const events: TimelineEvent[] = [
      tool({ toolName: 'Edit', toolInput: { file_path: '/a.ts' } }),
      tool({ toolName: 'Write', toolInput: { file_path: '/b.ts' } }),
      tool({ toolName: 'MultiEdit', toolInput: { file_path: '/c.ts' } }),
      tool({ toolName: 'Read', toolInput: { file_path: '/d.ts' } }),
    ]
    const result = extractSessionFiles(events)
    expect(result.modified.map((e) => e.path).sort()).toEqual(['/a.ts', '/b.ts', '/c.ts'])
    expect(result.read.map((e) => e.path)).toEqual(['/d.ts'])
  })

  it('NotebookEdit 은 file_path 가 아니라 notebook_path 를 사용한다', () => {
    const events: TimelineEvent[] = [
      tool({ toolName: 'NotebookEdit', toolInput: { notebook_path: '/n.ipynb', file_path: '/decoy.ts' } }),
    ]
    const result = extractSessionFiles(events)
    expect(result.modified.map((e) => e.path)).toEqual(['/n.ipynb'])
  })

  it('Grep/Bash 같은 다른 도구는 무시한다', () => {
    const events: TimelineEvent[] = [
      tool({ toolName: 'Grep', toolInput: { file_path: '/a.ts' } }),
      tool({ toolName: 'Bash', toolInput: { file_path: '/b.ts' } }),
    ]
    const result = extractSessionFiles(events)
    expect(result.modified).toEqual([])
    expect(result.read).toEqual([])
  })

  it('스킬/에이전트 호출로 표시된 이벤트는 제외한다', () => {
    const events: TimelineEvent[] = [
      tool({ toolName: 'Edit', toolInput: { file_path: '/a.ts' }, isSkillCall: true }),
      tool({ toolName: 'Read', toolInput: { file_path: '/b.ts' }, isAgentCall: true }),
    ]
    const result = extractSessionFiles(events)
    expect(result.modified).toEqual([])
    expect(result.read).toEqual([])
  })

  it('toolInput 이 없거나 file_path 가 빈 문자열/비문자열이면 무시한다', () => {
    const events: TimelineEvent[] = [
      tool({ toolName: 'Edit' }),
      tool({ toolName: 'Edit', toolInput: { file_path: '' } }),
      tool({ toolName: 'Edit', toolInput: { file_path: 42 } }),
    ]
    expect(extractSessionFiles(events).modified).toEqual([])
  })
})

describe('extractSessionFiles — 집계와 정렬', () => {
  it('같은 파일 반복 수정 시 count 가 누적되고 first/last 인덱스가 유지·갱신된다', () => {
    const events: TimelineEvent[] = [
      tool({ toolName: 'Edit', toolInput: { file_path: '/a.ts' }, timestamp: '2026-06-01T12:00:00Z' }),
      tool({ toolName: 'Read', toolInput: { file_path: '/x.ts' } }),
      tool({ toolName: 'Write', toolInput: { file_path: '/a.ts' }, timestamp: '2026-06-01T12:05:00Z' }),
    ]
    const [entry] = extractSessionFiles(events).modified
    expect(entry).toEqual({
      path: '/a.ts',
      count: 2,
      firstEventIdx: 0,
      lastEventIdx: 2,
      lastTimestamp: '2026-06-01T12:05:00Z',
    })
  })

  it('count 내림차순, 동률이면 lastTimestamp 내림차순으로 정렬한다', () => {
    const events: TimelineEvent[] = [
      tool({ toolName: 'Read', toolInput: { file_path: '/old.ts' }, timestamp: '2026-06-01T10:00:00Z' }),
      tool({ toolName: 'Read', toolInput: { file_path: '/new.ts' }, timestamp: '2026-06-01T11:00:00Z' }),
      tool({ toolName: 'Read', toolInput: { file_path: '/hot.ts' }, timestamp: '2026-06-01T09:00:00Z' }),
      tool({ toolName: 'Read', toolInput: { file_path: '/hot.ts' }, timestamp: '2026-06-01T09:30:00Z' }),
    ]
    const paths = extractSessionFiles(events).read.map((e) => e.path)
    expect(paths).toEqual(['/hot.ts', '/new.ts', '/old.ts'])
  })

  it('인덱스는 message 이벤트를 포함한 전체 배열 기준이다', () => {
    const events: TimelineEvent[] = [
      message(),
      message(),
      tool({ toolName: 'Edit', toolInput: { file_path: '/a.ts' } }),
    ]
    const [entry] = extractSessionFiles(events).modified
    expect(entry.firstEventIdx).toBe(2)
  })

  it('빈 입력은 빈 결과를 돌려준다', () => {
    expect(extractSessionFiles([])).toEqual({ modified: [], read: [] })
  })
})
