/**
 * format.test.ts — 대시보드 전역 포맷터 회귀 가드
 *
 * format.ts 의 함수들은 대시보드 거의 모든 화면(토큰·비용·기간 표시)에서 쓰이지만
 * 지금까지 테스트가 없었다. 결정적(deterministic) 함수만 고정한다 —
 * Date.now() 에 의존하는 formatLastUsed / base 없는 formatRelativeTime 은
 * 시간 주입이 불가능한 시그니처라 제외 (HEALTH.md 부채 항목 참고).
 *
 * 날짜 입력은 타임존 suffix 없는 로컬 ISO 문자열을 사용해 어떤 TZ 에서도
 * 같은 결과가 나오게 한다.
 */

import { describe, it, expect } from 'vitest'
import {
  formatTokens,
  formatCost,
  formatDate,
  formatDateTime,
  formatDateTimeFull,
  formatRelativeTime,
  formatDurationMs,
  formatDuration,
} from './format'

describe('formatTokens', () => {
  it('1,000 미만은 그대로 표기한다', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('1,000 이상은 K 단위로 표기한다', () => {
    expect(formatTokens(1_000)).toBe('1.0K')
    expect(formatTokens(1_549)).toBe('1.5K')
  })

  it('1,000,000 이상은 M 단위로 표기한다', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M')
    expect(formatTokens(2_350_000)).toBe('2.4M')
  })

  it('999,999 는 반올림되어 "1000.0K" 로 표기된다 (현재 동작)', () => {
    // TODO(bug): M 경계 직전 값이 "1000.0K" 로 표기된다. 사용자 기대는 "1.0M".
    expect(formatTokens(999_999)).toBe('1000.0K')
  })
})

describe('formatCost', () => {
  it('$1 이상은 소수 2자리', () => {
    expect(formatCost(1)).toBe('$1.00')
    expect(formatCost(2.5)).toBe('$2.50')
  })

  it('1센트 이상 $1 미만은 소수 3자리', () => {
    expect(formatCost(0.5)).toBe('$0.500')
    expect(formatCost(0.01)).toBe('$0.010')
  })

  it('1센트 미만은 소수 4자리', () => {
    expect(formatCost(0.005)).toBe('$0.0050')
    expect(formatCost(0)).toBe('$0.0000')
  })
})

describe('formatDate / formatDateTime / formatDateTimeFull', () => {
  it('formatDate 는 "MMM d" 형태로 표기한다', () => {
    expect(formatDate('2026-04-13T10:00:00')).toBe('Apr 13')
  })

  it('formatDateTime 은 12시간제로 표기한다', () => {
    expect(formatDateTime('2026-04-13T16:29:29')).toBe('04/13/2026 4:29:29 PM')
  })

  it('formatDateTimeFull 은 24시간제 풀 포맷으로 표기한다', () => {
    expect(formatDateTimeFull('2026-04-13T16:29:29')).toBe('2026-04-13 16:29:29')
  })

  it('파싱 불가능한 입력은 원문을 그대로 돌려준다', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
    expect(formatDateTimeFull('not-a-date')).toBe('not-a-date')
  })
})

describe('formatRelativeTime (base 기준 오프셋)', () => {
  const BASE = '2026-06-01T12:00:00'

  it('1시간 미만은 "+Nm" 으로 표기한다', () => {
    expect(formatRelativeTime('2026-06-01T12:00:30', BASE)).toBe('+0m')
    expect(formatRelativeTime('2026-06-01T12:59:59', BASE)).toBe('+59m')
  })

  it('1시간 이상은 "+Nh Nm" 으로 표기한다', () => {
    expect(formatRelativeTime('2026-06-01T13:00:00', BASE)).toBe('+1h 0m')
    expect(formatRelativeTime('2026-06-01T14:05:00', BASE)).toBe('+2h 5m')
  })

  it('base 보다 이른 timestamp 는 "+-1m" 처럼 깨진 표기가 된다 (현재 동작)', () => {
    // TODO(bug): 음수 diff 가드가 없어 out-of-order 이벤트에서 "+-1m" 으로 렌더된다.
    expect(formatRelativeTime('2026-06-01T11:59:30', BASE)).toBe('+-1m')
  })
})

describe('formatDurationMs', () => {
  it('1초 미만은 ms 단위', () => {
    expect(formatDurationMs(0)).toBe('0ms')
    expect(formatDurationMs(999)).toBe('999ms')
  })

  it('10초 미만은 소수 1자리 초', () => {
    expect(formatDurationMs(1000)).toBe('1.0s')
    expect(formatDurationMs(9_900)).toBe('9.9s')
  })

  it('10초 이상 1분 미만은 정수 초', () => {
    expect(formatDurationMs(10_000)).toBe('10s')
    expect(formatDurationMs(59_400)).toBe('59s')
  })

  it('1분 이상은 min 단위', () => {
    expect(formatDurationMs(60_000)).toBe('1min')
    expect(formatDurationMs(120_000)).toBe('2min')
  })

  it('59,999ms 는 반올림되어 "60s" 로 표기된다 (현재 동작)', () => {
    // TODO(bug): min 경계 직전 값이 "60s" 로 표기된다. 기대는 "1min".
    expect(formatDurationMs(59_999)).toBe('60s')
  })
})

describe('formatDuration (시작~종료)', () => {
  const START = '2026-06-01T12:00:00'

  it('1초 미만은 "0s"', () => {
    expect(formatDuration(START, '2026-06-01T12:00:00.500')).toBe('0s')
  })

  it('1분 미만은 초 단위', () => {
    expect(formatDuration(START, '2026-06-01T12:00:30')).toBe('30s')
    expect(formatDuration(START, '2026-06-01T12:00:59')).toBe('59s')
  })

  it('1시간 미만은 분 단위 (초 버림)', () => {
    expect(formatDuration(START, '2026-06-01T12:01:00')).toBe('1m')
    expect(formatDuration(START, '2026-06-01T12:59:59')).toBe('59m')
  })

  it('정각 시간은 "Nh", 나머지 분이 있으면 "Nh Nm"', () => {
    expect(formatDuration(START, '2026-06-01T13:00:00')).toBe('1h')
    expect(formatDuration(START, '2026-06-01T13:05:00')).toBe('1h 5m')
  })

  it('종료가 시작보다 이르면 0 으로 클램프되어 "0s"', () => {
    expect(formatDuration(START, '2026-06-01T11:00:00')).toBe('0s')
  })
})
