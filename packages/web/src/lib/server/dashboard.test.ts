import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDateRange, parsePagination } from './dashboard'

// parseDateRange 의 기본값 분기는 new Date()(현재 시각)와 로컬 달력(setDate)에
// 의존한다. 결정적 검증을 위해 week-range.test.ts 와 동일하게 TZ 를 UTC 로 핀하고
// (vitest 기본 isolate 덕분에 다른 테스트 파일로 누수되지 않는다), 기본값 분기는
// fake timer 로 시스템 시간을 고정해서 검증한다.
process.env.TZ = 'UTC'

describe('parseDateRange', () => {
  it('날짜만 있는 from/to 는 from 은 그대로, to 는 그 날의 끝(23:59:59.999 UTC)으로 확장한다', () => {
    const { from, to } = parseDateRange('2026-04-01', '2026-04-16')
    expect(from.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-04-16T23:59:59.999Z')
  })

  it('전체 timestamp 입력 시 from 은 시각을 보존하지만 to 는 시각을 버리고 그 날의 끝으로 확장한다 (비대칭, 현재 동작 고정)', () => {
    const { from, to } = parseDateRange('2026-04-01T08:30:00.000Z', '2026-04-16T10:00:00.000Z')
    expect(from.toISOString()).toBe('2026-04-01T08:30:00.000Z')
    expect(to.toISOString()).toBe('2026-04-16T23:59:59.999Z')
  })

  it('from > to 면 두 값을 맞바꾼다 — to 의 끝-of-day 확장이 swap 보다 먼저 적용된다', () => {
    const { from, to } = parseDateRange('2026-05-01', '2026-04-01')
    expect(from.toISOString()).toBe('2026-04-01T23:59:59.999Z')
    expect(to.toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })

  describe('기본값 분기 (시스템 시간 2026-06-15T12:00:00Z 고정)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('둘 다 없으면 now 기준 최근 30일 범위를 반환한다', () => {
      const { from, to } = parseDateRange(undefined, undefined)
      expect(from.toISOString()).toBe('2026-05-16T12:00:00.000Z')
      expect(to.toISOString()).toBe('2026-06-15T12:00:00.000Z')
    })

    it('파싱 불가능한 from 은 조용히 기본값(now-30일)으로 대체된다', () => {
      const { from, to } = parseDateRange('not-a-date', '2026-06-10')
      expect(from.toISOString()).toBe('2026-05-16T12:00:00.000Z')
      expect(to.toISOString()).toBe('2026-06-10T23:59:59.999Z')
    })

    it('파싱 불가능한 to 는 now 로 대체되며 끝-of-day 확장은 적용되지 않는다', () => {
      const { from, to } = parseDateRange('2026-06-01', 'garbage')
      expect(from.toISOString()).toBe('2026-06-01T00:00:00.000Z')
      expect(to.toISOString()).toBe('2026-06-15T12:00:00.000Z')
    })

    it('빈 문자열은 falsy 라서 미지정과 동일하게 기본값 분기를 탄다', () => {
      const { from, to } = parseDateRange('', '')
      expect(from.toISOString()).toBe('2026-05-16T12:00:00.000Z')
      expect(to.toISOString()).toBe('2026-06-15T12:00:00.000Z')
    })
  })
})

describe('parsePagination', () => {
  it('정상 입력: page=2, pageSize=20 → skip 은 (page-1)*pageSize', () => {
    expect(parsePagination('2', '20')).toEqual({ page: 2, pageSize: 20, skip: 20, take: 20 })
  })

  it('미지정 시 page=1, pageSize=50(기본), skip=0', () => {
    expect(parsePagination(undefined, undefined)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('null 입력은 Number(null)=0 경로를 타서 기본값과 동일하다', () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it.each([
    ['0', '1 미만은 1로'],
    ['-5', '음수는 1로'],
    ['abc', 'NaN 은 1로'],
    ['Infinity', '무한대는 1로'],
  ])('page=%s → 1 (%s)', (input) => {
    expect(parsePagination(input, '50').page).toBe(1)
  })

  it('소수 page 는 내림 처리되고 skip 도 내림된 page 기준으로 계산된다', () => {
    const result = parsePagination('2.7', '50')
    expect(result.page).toBe(2)
    expect(result.skip).toBe(50)
  })

  it('pageSize 가 최소(10) 미만의 양수면 10으로 올려 clamp 된다', () => {
    expect(parsePagination('1', '5').pageSize).toBe(10)
  })

  it('pageSize 가 최대(100) 초과면 100으로 내려 clamp 된다 — DB 무제한 take 방지 가드', () => {
    expect(parsePagination('1', '500').pageSize).toBe(100)
  })

  it.each([
    ['0', '0은 clamp 가 아니라 기본값'],
    ['-20', '음수는 기본값'],
    ['abc', 'NaN 은 기본값'],
    ['Infinity', '무한대는 기본값'],
  ])('pageSize=%s → 50 (%s)', (input) => {
    expect(parsePagination('1', input).pageSize).toBe(50)
  })

  it('page=3, pageSize=100 → skip=200 (최대 페이지 크기에서의 offset 산술)', () => {
    expect(parsePagination('3', '100')).toEqual({ page: 3, pageSize: 100, skip: 200, take: 100 })
  })
})
