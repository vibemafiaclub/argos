import { describe, it, expect } from 'vitest'
import { getWeekRangeForDate, parseWeekParam, formatWeekLabel } from './week-range'

// TODO(bug): week-range.ts 의 startOfISOWeek(date-fns)는 "로컬 타임존" 기준으로 동작한다.
// 프로덕션(Vercel)·CI 는 TZ=UTC 라 정상이지만, UTC 가 아닌 서버/로컬에서 실행하면
// 주 시작일이 하루 어긋난 범위가 반환된다 (예: KST 에서 월요일 00:00 UTC 입력 →
// 일요일 시작 범위). 현재 동작을 고정하기 위해 테스트는 프로덕션과 동일한 UTC 로 핀한다.
// vitest 기본 isolate(파일별 fork) 덕분에 다른 테스트 파일에 누수되지 않는다.
process.env.TZ = 'UTC'

describe('getWeekRangeForDate', () => {
  it('주중(수요일) 날짜는 해당 ISO 주의 월요일 00:00 UTC ~ 일요일 23:59:59.999 UTC 를 반환한다', () => {
    const range = getWeekRangeForDate(new Date('2026-06-03T12:00:00Z'))
    expect(range.start.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-06-07T23:59:59.999Z')
    expect(range.isoKey).toBe('2026-W23')
  })

  it('월요일 00:00 UTC 정각은 그 주 자신에 속한다 (시작 경계)', () => {
    const range = getWeekRangeForDate(new Date('2026-06-01T00:00:00Z'))
    expect(range.start.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(range.isoKey).toBe('2026-W23')
  })

  it('일요일 23:59:59.999 UTC 는 다음 주가 아니라 그 주에 속한다 (끝 경계)', () => {
    const range = getWeekRangeForDate(new Date('2026-06-07T23:59:59.999Z'))
    expect(range.start.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(range.isoKey).toBe('2026-W23')
  })

  it('연초 날짜가 전년도에서 시작하는 ISO 주에 속하면 주 시작은 전년도 날짜다', () => {
    // 2026-W01 = 2025-12-29(월) ~ 2026-01-04(일)
    const range = getWeekRangeForDate(new Date('2026-01-01T00:00:00Z'))
    expect(range.start.toISOString()).toBe('2025-12-29T00:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-01-04T23:59:59.999Z')
    expect(range.isoKey).toBe('2026-W01')
  })

  it('isoKey 의 주 번호는 2자리로 0-패딩된다', () => {
    const range = getWeekRangeForDate(new Date('2026-01-01T00:00:00Z'))
    expect(range.isoKey).toMatch(/^2026-W0\d$/)
  })
})

describe('parseWeekParam', () => {
  it('"2026-W23" 을 해당 주 범위로 파싱한다 (golden path)', () => {
    const range = parseWeekParam('2026-W23')
    expect(range).not.toBeNull()
    expect(range!.start.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(range!.end.toISOString()).toBe('2026-06-07T23:59:59.999Z')
    expect(range!.isoKey).toBe('2026-W23')
  })

  it('주 번호 한 자리("2026-W1")도 허용한다 (0-패딩 없이)', () => {
    const range = parseWeekParam('2026-W1')
    expect(range).not.toBeNull()
    expect(range!.isoKey).toBe('2026-W01')
  })

  it('W00 은 거부한다 (하한 경계)', () => {
    expect(parseWeekParam('2026-W00')).toBeNull()
  })

  it('W54 는 거부한다 (상한 경계)', () => {
    expect(parseWeekParam('2026-W54')).toBeNull()
  })

  it('53주가 있는 해(2026)의 W53 은 그 해 마지막 주를 반환한다', () => {
    // 2026-01-01 이 목요일 → 2026 은 ISO 53주 해. 2026-W53 = 2026-12-28(월) ~ 2027-01-03(일)
    const range = parseWeekParam('2026-W53')
    expect(range).not.toBeNull()
    expect(range!.start.toISOString()).toBe('2026-12-28T00:00:00.000Z')
    expect(range!.isoKey).toBe('2026-W53')
  })

  // TODO(bug): 52주뿐인 해에 W53 을 요청하면 null 이 아니라 다음 해 W01 범위가
  // 조용히 반환된다 (입력 isoKey 와 반환 isoKey 불일치). 주간 리포트 URL 에
  // ?week=2025-W53 을 넣으면 2026-W01 데이터가 표시된다. 현재 동작을 고정한다.
  it('52주뿐인 해(2025)의 W53 은 다음 해 W01 범위로 넘어간다 (현재 동작 고정)', () => {
    const range = parseWeekParam('2025-W53')
    expect(range).not.toBeNull()
    expect(range!.isoKey).toBe('2026-W01')
    expect(range!.start.toISOString()).toBe('2025-12-29T00:00:00.000Z')
  })

  it.each([
    ['빈 문자열', ''],
    ['주 구분자 없음', '2026W23'],
    ['소문자 w', '2026-w23'],
    ['연도 3자리', '202-W23'],
    ['주 번호 3자리', '2026-W230'],
    ['앞 공백', ' 2026-W23'],
    ['뒤 잉여 문자', '2026-W23x'],
    ['연도 비숫자', 'abcd-W23'],
  ])('형식이 깨진 입력은 null 을 반환한다 — %s', (_label, input) => {
    expect(parseWeekParam(input)).toBeNull()
  })

  it('getWeekRangeForDate 가 만든 isoKey 를 다시 파싱하면 동일한 범위가 나온다 (roundtrip)', () => {
    const original = getWeekRangeForDate(new Date('2026-03-15T00:00:00Z'))
    const reparsed = parseWeekParam(original.isoKey)
    expect(reparsed).not.toBeNull()
    expect(reparsed!.start.toISOString()).toBe(original.start.toISOString())
    expect(reparsed!.end.toISOString()).toBe(original.end.toISOString())
    expect(reparsed!.isoKey).toBe(original.isoKey)
  })
})

describe('formatWeekLabel', () => {
  it('isoKey 와 M/d 구간을 합친 라벨을 만든다', () => {
    const range = getWeekRangeForDate(new Date('2026-06-03T12:00:00Z'))
    expect(formatWeekLabel(range.start, range.end)).toBe('2026-W23 (6/1~6/7)')
  })
})
