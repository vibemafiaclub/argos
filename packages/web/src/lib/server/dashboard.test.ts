import { describe, it, expect } from 'vitest'
import { parsePagination, parseDateRange } from './dashboard'

// 이 두 함수는 모든 대시보드 쿼리의 입력 경계를 정한다:
//   - parsePagination → Prisma 의 skip/take (음수 skip 이나 무제한 take 는 즉시 데이터/성능 사고)
//   - parseDateRange  → 어떤 이벤트가 조회되는지 (from>to 스왑·끝날 보정·기본 30일 창)
// 둘 다 순수 함수라 server-only/DB 없이 import 가능 (db 는 lazy connect).

const DAY_MS = 24 * 60 * 60 * 1000

describe('parsePagination', () => {
  it('인자 없으면 page=1, pageSize=50, skip=0, take=50 기본값', () => {
    expect(parsePagination()).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('null 입력도 기본값으로 떨어진다', () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('정상 입력은 skip=(page-1)*pageSize 로 계산된다', () => {
    expect(parsePagination('3', '20')).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 })
  })

  it('소수 page/pageSize 는 floor 된다', () => {
    expect(parsePagination('2.9', '20.7')).toEqual({ page: 2, pageSize: 20, skip: 20, take: 20 })
  })

  it('pageSize 상한 100 으로 clamp (무제한 take 방지)', () => {
    expect(parsePagination('1', '500').pageSize).toBe(100)
  })

  it('pageSize 하한 10 으로 clamp', () => {
    expect(parsePagination('1', '5').pageSize).toBe(10)
  })

  it('pageSize 가 0/음수/비숫자면 기본 50 (clamp 전 default)', () => {
    expect(parsePagination('1', '0').pageSize).toBe(50)
    expect(parsePagination('1', '-10').pageSize).toBe(50)
    expect(parsePagination('1', 'abc').pageSize).toBe(50)
  })

  // 핵심 안전 불변식: page<1 (0·음수·비숫자·빈문자) 은 1 로 보정되어
  // skip 이 절대 음수가 될 수 없다. 음수 skip 은 Prisma 에서 던지거나 잘못된 페이지를 반환한다.
  it('page 가 1 미만/비숫자면 1 로 보정 → skip 음수 불가', () => {
    for (const bad of ['0', '-5', 'abc', '', 'NaN', '0.5']) {
      const r = parsePagination(bad, '20')
      expect(r.page).toBe(1)
      expect(r.skip).toBe(0)
      expect(r.skip).toBeGreaterThanOrEqual(0)
    }
  })

  // 적대적 입력 전수: 어떤 입력이 와도 skip>=0, take∈[10,100] 불변식 유지.
  it('임의 입력에서도 skip>=0, take 는 [10,100] 범위', () => {
    const inputs: Array<[string | null | undefined, string | null | undefined]> = [
      [undefined, undefined], ['-1', '-1'], ['1e9', '1e9'], ['abc', 'xyz'],
      ['0', '0'], ['999999', '999999'], ['1.5', '9.9'], [null, '5'],
    ]
    for (const [p, s] of inputs) {
      const r = parsePagination(p, s)
      expect(r.skip).toBeGreaterThanOrEqual(0)
      expect(r.take).toBeGreaterThanOrEqual(10)
      expect(r.take).toBeLessThanOrEqual(100)
      expect(r.take).toBe(r.pageSize)
    }
  })
})

describe('parseDateRange', () => {
  it('유효한 from/to: from 은 자정, to 는 그 날 끝(23:59:59.999 UTC, 끝날 포함)', () => {
    const { from, to } = parseDateRange('2026-04-10', '2026-04-20')
    expect(from.toISOString()).toBe('2026-04-10T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-04-20T23:59:59.999Z')
  })

  it('to 의 시간 성분은 항상 그 날 끝으로 정규화된다 (datetime 도 끝날로)', () => {
    const { to } = parseDateRange('2026-04-10', '2026-04-20T08:30:15.500Z')
    expect(to.toISOString()).toBe('2026-04-20T23:59:59.999Z')
  })

  it('from > to 면 스왑해 범위를 뒤집지 않는다 (from <= to 보장)', () => {
    const { from, to } = parseDateRange('2026-06-01', '2026-05-01')
    expect(from.getTime()).toBeLessThanOrEqual(to.getTime())
    // 현재 동작: to 보정(끝날) 후 스왑되므로 from 이 05-01 끝날, to 가 06-01 자정이 된다.
    expect(from.toISOString()).toBe('2026-05-01T23:59:59.999Z')
    expect(to.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('to 가 잘못된 문자열이면 now 로 폴백 (from 은 유효값 유지)', () => {
    const before = Date.now()
    const { from, to } = parseDateRange('2020-01-01', 'garbage')
    const after = Date.now()
    expect(from.toISOString()).toBe('2020-01-01T00:00:00.000Z')
    expect(to.getTime()).toBeGreaterThanOrEqual(before)
    expect(to.getTime()).toBeLessThanOrEqual(after)
  })

  it('인자 없으면 기본 최근 30일 창 (to≈now, to-from≈30일)', () => {
    const before = Date.now()
    const { from, to } = parseDateRange()
    const after = Date.now()
    expect(to.getTime()).toBeGreaterThanOrEqual(before)
    expect(to.getTime()).toBeLessThanOrEqual(after)
    expect(Math.round((to.getTime() - from.getTime()) / DAY_MS)).toBe(30)
  })
})
