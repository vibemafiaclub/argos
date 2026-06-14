import { describe, it, expect } from 'vitest'
import { parsePagination, parseDateRange } from './dashboard'

// dashboard.ts 는 './db' 를 import 하지만 PrismaClient 생성은 지연(lazy)이라
// DATABASE_URL 없이도 import 단계에서 터지지 않는다 (./env 는 import 하지 않음).
// 따라서 순수 함수 parsePagination / parseDateRange 는 추출 없이 직접 import 해 고정한다.
// TZ 비의존 분기만 검증하기 위해 UTC 로 핀한다 (parseDateRange 의 setUTCHours 는 TZ 무관이지만
// 명시적으로 고정해 다른 환경에서도 동일하게 동작함을 보장한다).
process.env.TZ = 'UTC'

describe('parsePagination', () => {
  // 이 함수는 Prisma 의 skip/take 를 직접 결정한다.
  // clamp 가 깨지면: pageSize 하한 붕괴 → 과소 페치, 상한 붕괴 → 무한정 쿼리(사실상 DoS),
  // page 가드 붕괴 → 음수 skip → Prisma 런타임 에러. 전부 무증상으로 새어나가는 위험이라 고정한다.

  it('인자가 없으면 page=1, pageSize=50, skip=0, take=50 을 반환한다 (기본값)', () => {
    expect(parsePagination()).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('null 입력은 기본값으로 떨어진다 (Number(null)=0 → page 가드/사이즈 가드 통과 실패)', () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('숫자가 아닌 page/pageSize 는 기본값으로 떨어진다 (NaN 방어)', () => {
    expect(parsePagination('abc', 'xyz')).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('page=0 은 1 로 보정된다 (>= 1 가드 — 음수 skip 방지)', () => {
    expect(parsePagination('0').page).toBe(1)
  })

  it('page 가 음수면 1 로 보정된다 (음수 skip 방지)', () => {
    const result = parsePagination('-3')
    expect(result.page).toBe(1)
    expect(result.skip).toBe(0)
  })

  it('소수 page 는 내림(floor)된다 (page=3.7 → 3)', () => {
    expect(parsePagination('3.7').page).toBe(3)
  })

  it('pageSize 가 하한(10) 미만이면 10 으로 끌어올린다', () => {
    expect(parsePagination('1', '5').pageSize).toBe(10)
  })

  it('pageSize 가 상한(100) 초과면 100 으로 깎는다 (무한정 쿼리 방지)', () => {
    expect(parsePagination('1', '9999').pageSize).toBe(100)
  })

  it('pageSize=0 은 기본값 50 으로 떨어진다 (> 0 가드)', () => {
    expect(parsePagination('1', '0').pageSize).toBe(50)
  })

  it('소수 pageSize 는 내림된다 (50.9 → 50)', () => {
    expect(parsePagination('1', '50.9').pageSize).toBe(50)
  })

  it('skip = (page-1) * pageSize, take = pageSize 로 계산한다', () => {
    expect(parsePagination('3', '20')).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 })
  })
})

describe('parseDateRange', () => {
  // now() 를 내부에서 캡처하므로 시간 의존 분기(기본 30일/to=now)는 정확값을 단언하지 않는다.
  // 시간 비의존 분기만 고정한다: 종일(end-of-day) 보정, from>to swap, 잘못된 입력의 fallback 유효성.

  it('to 날짜는 그 날의 끝(23:59:59.999 UTC)까지 포함한다 (하루 누락 방지)', () => {
    const { from, to } = parseDateRange('2026-01-01', '2026-01-01')
    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-01-01T23:59:59.999Z')
  })

  it('정상 범위(from < to)는 from 00:00, to 23:59:59.999 로 정규화한다', () => {
    const { from, to } = parseDateRange('2026-04-01', '2026-04-16')
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-04-16T23:59:59.999Z')
  })

  it('from > to 이면 둘을 swap 해 빈 범위가 쿼리로 새지 않게 한다', () => {
    // swap 은 to 의 end-of-day 보정 이후에 일어나므로, swap 후 from 이 23:59:59.999 를,
    // to 가 00:00 을 갖는 현재 동작을 그대로 고정한다 (재정규화하지 않음).
    const { from, to } = parseDateRange('2026-05-01', '2026-04-01')
    expect(from.toISOString()).toBe('2026-04-01T23:59:59.999Z')
    expect(to.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(from.getTime()).toBeLessThan(to.getTime())
  })

  it('from 이 파싱 불가하면 유효한 기본값으로 떨어진다 (Invalid Date 가 쿼리로 새지 않음)', () => {
    const { from, to } = parseDateRange('not-a-date', '2099-01-01')
    expect(Number.isNaN(from.getTime())).toBe(false)
    expect(from.getTime()).toBeLessThanOrEqual(to.getTime())
  })

  it('to 가 파싱 불가하면 유효한 기본값(now)으로 떨어진다 (Invalid Date 방어)', () => {
    const { from, to } = parseDateRange('2020-01-01', 'garbage')
    expect(from.toISOString()).toBe('2020-01-01T00:00:00.000Z')
    expect(Number.isNaN(to.getTime())).toBe(false)
    expect(from.getTime()).toBeLessThanOrEqual(to.getTime())
  })
})
