/**
 * dashboard.test.ts — parseDateRange / parsePagination 회귀 가드
 *
 * 모든 대시보드 API 라우트(overview/users/skills/agents/sessions)가
 * 쿼리스트링을 이 두 함수로 파싱한다. 경계가 하루만 어긋나도
 * 집계 숫자가 달라지므로 현재 동작을 고정한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// db 모듈은 import 시점에 PrismaClient 를 생성하므로 stub 처리
// (parseDateRange/parsePagination 자체는 순수 함수 — DB 를 건드리지 않는다)
vi.mock('./db', () => ({ db: {} }))

import { parseDateRange, parsePagination } from './dashboard'

describe('parseDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-12T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('인자가 없으면 최근 30일(now-30d ~ now)을 반환한다', () => {
    const { from, to } = parseDateRange()
    expect(to.toISOString()).toBe('2026-06-12T12:00:00.000Z')
    expect(from.toISOString()).toBe('2026-05-13T12:00:00.000Z')
  })

  it('날짜만 있는 to(YYYY-MM-DD)는 해당 UTC 날짜의 끝(23:59:59.999)으로 보정한다', () => {
    const { to } = parseDateRange('2026-04-01', '2026-04-16')
    expect(to.toISOString()).toBe('2026-04-16T23:59:59.999Z')
  })

  it('시각이 포함된 to 도 그 날의 끝으로 덮어쓴다 (시각 정보 유실)', () => {
    // TODO(bug): "2026-04-16" 보정을 위한 setUTCHours(23,59,59,999) 가
    // "2026-04-16T10:00:00Z" 같은 풀 타임스탬프에도 적용되어 시각이 버려진다.
    // 시간 단위 범위 조회가 불가능한 현재 동작을 고정한다.
    const { to } = parseDateRange('2026-04-01', '2026-04-16T10:00:00Z')
    expect(to.toISOString()).toBe('2026-04-16T23:59:59.999Z')
  })

  it('to 만 30일 범위 밖 과거로 주면 기본 from(now-30d)과 swap 되어 돌아온다', () => {
    // TODO(bug): from 을 생략하고 오래된 to 만 주면 기본 from(now-30d)이 to 보다
    // 미래라서 조용히 swap 된다 — 호출자가 의도한 "~4/16까지" 가
    // "4/16 ~ 5/13" 으로 둔갑한다. 에러 대신 swap 하는 현재 동작을 고정한다.
    const { from, to } = parseDateRange(undefined, '2026-04-16')
    expect(from.toISOString()).toBe('2026-04-16T23:59:59.999Z')
    expect(to.toISOString()).toBe('2026-05-13T12:00:00.000Z')
  })

  it('from 은 보정 없이 파싱값 그대로 사용한다 (UTC 자정)', () => {
    const { from } = parseDateRange('2026-04-01', '2026-04-16')
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })

  it('파싱 불가능한 from 은 조용히 기본값(now-30d)으로 떨어진다', () => {
    const { from } = parseDateRange('not-a-date')
    expect(from.toISOString()).toBe('2026-05-13T12:00:00.000Z')
  })

  it('파싱 불가능한 to 는 조용히 now 로 떨어진다 (end-of-day 보정 없음)', () => {
    const { to } = parseDateRange(undefined, 'garbage')
    expect(to.toISOString()).toBe('2026-06-12T12:00:00.000Z')
  })

  it('from > to 이면 에러 대신 둘을 맞바꾼다', () => {
    const { from, to } = parseDateRange('2026-05-01', '2026-04-01')
    expect(from.toISOString()).toBe('2026-04-01T23:59:59.999Z')
    expect(to.toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })
})

describe('parsePagination', () => {
  it('쿼리가 없으면 page=1, pageSize=50 이다', () => {
    expect(parsePagination()).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('page/pageSize 를 반영해 skip/take 를 계산한다', () => {
    expect(parsePagination('3', '20')).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 })
  })

  it('page 가 0/음수/문자/빈 문자열이면 1 로 떨어진다', () => {
    expect(parsePagination('0').page).toBe(1)
    expect(parsePagination('-5').page).toBe(1)
    expect(parsePagination('abc').page).toBe(1)
    expect(parsePagination('').page).toBe(1)
  })

  it('소수 page 는 내림한다', () => {
    expect(parsePagination('2.7').page).toBe(2)
  })

  it('pageSize 는 [10, 100] 으로 clamp 된다', () => {
    expect(parsePagination(undefined, '5').pageSize).toBe(10)
    expect(parsePagination(undefined, '500').pageSize).toBe(100)
  })

  it('pageSize 가 0/음수/문자면 기본값 50 으로 떨어진다', () => {
    expect(parsePagination(undefined, '0').pageSize).toBe(50)
    expect(parsePagination(undefined, '-1').pageSize).toBe(50)
    expect(parsePagination(undefined, 'xyz').pageSize).toBe(50)
  })

  it('0 < pageSize < 1 은 내림 후 0 이 되지만 최소 10 으로 clamp 된다', () => {
    expect(parsePagination(undefined, '0.5').pageSize).toBe(10)
  })
})
