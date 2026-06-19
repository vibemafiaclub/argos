import { describe, it, expect } from 'vitest'
import {
  formatTokens,
  formatCost,
  formatDurationMs,
  formatRelativeTime,
  formatDuration,
  formatDateTime,
  formatDateTimeFull,
} from './format'

// formatDate/formatDateTime 등의 "유효 입력" 렌더링은 로컬 타임존 의존(브라우저 표시용)이라
// 여기서는 다루지 않는다. TZ 와 무관하게 결정적인 함수/분기만 고정한다.

describe('formatTokens', () => {
  it('1,000 미만은 그대로 표시한다', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('1,000 이상은 K 단위로 소수 1자리 표시한다', () => {
    expect(formatTokens(1_000)).toBe('1.0K')
    expect(formatTokens(1_550)).toBe('1.6K')
  })

  it('999,999 는 M 으로 올라가지 않고 "1000.0K" 로 표시된다 (현재 동작 고정)', () => {
    expect(formatTokens(999_999)).toBe('1000.0K')
  })

  it('1,000,000 이상은 M 단위로 표시한다', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M')
    expect(formatTokens(2_350_000)).toBe('2.4M')
  })
})

describe('formatCost', () => {
  it('$1 이상은 소수 2자리', () => {
    expect(formatCost(1)).toBe('$1.00')
    expect(formatCost(12.5)).toBe('$12.50')
  })

  it('$0.01 이상 $1 미만은 소수 3자리', () => {
    expect(formatCost(0.5)).toBe('$0.500')
    expect(formatCost(0.01)).toBe('$0.010')
  })

  it('$0.01 미만은 소수 4자리', () => {
    expect(formatCost(0.009)).toBe('$0.0090')
    expect(formatCost(0.0001)).toBe('$0.0001')
  })

  it('0원은 "$0.0000" 으로 표시된다 (현재 동작 고정)', () => {
    expect(formatCost(0)).toBe('$0.0000')
  })
})

describe('formatDurationMs', () => {
  it('1초 미만은 ms 정수로 표시한다', () => {
    expect(formatDurationMs(0)).toBe('0ms')
    expect(formatDurationMs(999)).toBe('999ms')
  })

  it('999.6ms 는 반올림되어 "1000ms" 로 표시된다 (단위 승격 없음 — 현재 동작 고정)', () => {
    expect(formatDurationMs(999.6)).toBe('1000ms')
  })

  it('10초 미만은 소수 1자리 초, 10초 이상은 정수 초', () => {
    expect(formatDurationMs(1_000)).toBe('1.0s')
    expect(formatDurationMs(9_999)).toBe('10.0s')
    expect(formatDurationMs(10_000)).toBe('10s')
  })

  it('59,999ms 는 "1min" 이 아니라 "60s" 로 표시된다 (현재 동작 고정)', () => {
    expect(formatDurationMs(59_999)).toBe('60s')
  })

  it('1분 이상은 분 단위 반올림', () => {
    expect(formatDurationMs(60_000)).toBe('1min')
    expect(formatDurationMs(90_000)).toBe('2min')
  })
})

describe('formatRelativeTime (baseTimestamp 오프셋 모드)', () => {
  it('같은 시각이면 "+0m"', () => {
    expect(
      formatRelativeTime('2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'),
    ).toBe('+0m')
  })

  it('60분 미만은 "+Nm"', () => {
    expect(
      formatRelativeTime('2026-06-01T00:03:30Z', '2026-06-01T00:00:00Z'),
    ).toBe('+3m')
    expect(
      formatRelativeTime('2026-06-01T00:59:59Z', '2026-06-01T00:00:00Z'),
    ).toBe('+59m')
  })

  it('60분 이상은 "+Nh Nm"', () => {
    expect(
      formatRelativeTime('2026-06-01T01:00:00Z', '2026-06-01T00:00:00Z'),
    ).toBe('+1h 0m')
    expect(
      formatRelativeTime('2026-06-01T01:05:00Z', '2026-06-01T00:00:00Z'),
    ).toBe('+1h 5m')
  })

  // TODO(bug): timestamp 가 base 보다 빠르면(타임라인 역순 데이터) Math.floor 가
  // 음수로 내려가 "+-1m" 같은 비정상 문자열이 렌더된다. 현재 동작을 고정한다.
  it('timestamp 가 base 보다 빠르면 "+-1m" 을 반환한다 (현재 동작 고정)', () => {
    expect(
      formatRelativeTime('2026-06-01T00:00:00Z', '2026-06-01T00:00:30Z'),
    ).toBe('+-1m')
  })
})

describe('formatDuration', () => {
  it('1초 미만 또는 음수 구간은 "0s"', () => {
    expect(formatDuration('2026-06-01T00:00:00Z', '2026-06-01T00:00:00.500Z')).toBe('0s')
    expect(formatDuration('2026-06-01T00:01:00Z', '2026-06-01T00:00:00Z')).toBe('0s')
  })

  it('1분 미만은 초 단위', () => {
    expect(formatDuration('2026-06-01T00:00:00Z', '2026-06-01T00:00:59Z')).toBe('59s')
  })

  it('1시간 미만은 분 단위 (초는 버림)', () => {
    expect(formatDuration('2026-06-01T00:00:00Z', '2026-06-01T00:01:00Z')).toBe('1m')
    expect(formatDuration('2026-06-01T00:00:00Z', '2026-06-01T00:59:59Z')).toBe('59m')
  })

  it('정시는 "Nh", 나머지는 "Nh Nm"', () => {
    expect(formatDuration('2026-06-01T00:00:00Z', '2026-06-01T02:00:00Z')).toBe('2h')
    expect(formatDuration('2026-06-01T00:00:00Z', '2026-06-01T01:05:00Z')).toBe('1h 5m')
  })
})

describe('잘못된 날짜 입력 fallback', () => {
  it('formatDateTime 은 파싱 불가 문자열을 그대로 돌려준다', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
  })

  it('formatDateTimeFull 도 파싱 불가 문자열을 그대로 돌려준다', () => {
    expect(formatDateTimeFull('not-a-date')).toBe('not-a-date')
  })
})
