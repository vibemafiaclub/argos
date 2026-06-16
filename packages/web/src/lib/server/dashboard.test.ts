/**
 * dashboard.test.ts — parsePagination / parseDateRange 회귀 가드
 *
 * 이 두 함수는 대시보드 sessions/users API 라우트
 * (`api/orgs/[orgSlug]/dashboard/{sessions,users}/route.ts`)에서 사용자 제공
 * 쿼리스트링을 받아 Prisma 의 skip/take 와 날짜 범위 where 절로 직접 흘려보낸다.
 * clamp 경계가 깨지면 take 가 과대(부하)하거나 0(빈 결과)이 되고, skip 산술이
 * 어긋나면 페이지가 밀려 잘못된 행이 노출된다 — 둘 다 무방비였다 (HEALTH.md §3 구멍).
 *
 * 순수 함수이지만 dashboard.ts 가 모듈 최상단에서 ./db(PrismaClient)를 import 한다.
 * PrismaClient 생성자는 DATABASE_URL 없이도 throw 하지 않으므로(daily-rollup.test.ts
 * 와 동일 패턴) 쿼리 없는 이 import 는 vitest 수집을 깨지 않는다.
 */

import { describe, it, expect } from 'vitest'
import { parsePagination, parseDateRange } from './dashboard'

describe('parsePagination', () => {
  it('인자 없음 → page=1, pageSize=50, skip=0, take=50 (기본값)', () => {
    expect(parsePagination()).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('null 쿼리도 기본값으로 떨어진다', () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('정상 범위 page/pageSize 는 그대로 반영되고 skip 은 (page-1)*pageSize 다', () => {
    expect(parsePagination('3', '20')).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 })
  })

  it('pageSize 는 상한 100 으로 clamp 된다 (과대 take 방지)', () => {
    const r = parsePagination('1', '500')
    expect(r.pageSize).toBe(100)
    expect(r.take).toBe(100)
  })

  it('pageSize 는 하한 10 으로 clamp 된다 (take=0/과소 방지)', () => {
    const r = parsePagination('1', '5')
    expect(r.pageSize).toBe(10)
    expect(r.take).toBe(10)
  })

  it('경계값 100 과 10 은 통과한다', () => {
    expect(parsePagination('1', '100').pageSize).toBe(100)
    expect(parsePagination('1', '10').pageSize).toBe(10)
  })

  it('소수 page 는 floor 된다', () => {
    expect(parsePagination('2.9', '20').page).toBe(2)
  })

  it('page < 1 (0, 음수)은 1 로 정규화된다', () => {
    expect(parsePagination('0').page).toBe(1)
    expect(parsePagination('-5').page).toBe(1)
  })

  it('숫자가 아닌 page 는 1 로, pageSize 는 기본 50 으로 fallback 한다', () => {
    const r = parsePagination('abc', 'xyz')
    expect(r.page).toBe(1)
    expect(r.pageSize).toBe(50)
  })

  it('0/음수 pageSize 는 기본 50 으로 fallback 한다 (clamp 이전 분기)', () => {
    expect(parsePagination('1', '0').pageSize).toBe(50)
    expect(parsePagination('1', '-3').pageSize).toBe(50)
  })

  it('소수 pageSize 는 floor 후 clamp 된다', () => {
    expect(parsePagination('1', '30.7').pageSize).toBe(30)
  })
})

describe('parseDateRange', () => {
  it('명시적 from/to: from 은 UTC 자정, to 는 그 날짜의 끝(23:59:59.999)으로 보정된다', () => {
    const { from, to } = parseDateRange('2026-04-01', '2026-04-16')
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-04-16T23:59:59.999Z')
  })

  it('from > to 면 두 값을 swap 해 항상 from <= to 를 보장한다', () => {
    const { from, to } = parseDateRange('2026-01-10', '2026-01-05')
    // to='2026-01-05' 는 end-of-day 보정(23:59:59.999) 후 from='2026-01-10' 자정보다
    // 이르므로 swap 된다.
    expect(from.toISOString()).toBe('2026-01-05T23:59:59.999Z')
    expect(to.toISOString()).toBe('2026-01-10T00:00:00.000Z')
    expect(from.getTime()).toBeLessThanOrEqual(to.getTime())
  })

  it('잘못된 to 문자열은 throw 하지 않고 유효한 Date 로 fallback 한다', () => {
    const { from, to } = parseDateRange('2026-04-01', 'not-a-date')
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(to).toBeInstanceOf(Date)
    expect(Number.isNaN(to.getTime())).toBe(false)
  })

  it('잘못된 from 문자열도 throw 하지 않고 from <= to 불변식을 유지한다', () => {
    const { from, to } = parseDateRange('garbage', '2026-04-16')
    expect(from).toBeInstanceOf(Date)
    expect(Number.isNaN(from.getTime())).toBe(false)
    expect(from.getTime()).toBeLessThanOrEqual(to.getTime())
  })
})
