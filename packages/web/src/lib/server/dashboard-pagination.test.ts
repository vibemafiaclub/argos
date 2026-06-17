import { describe, it, expect } from 'vitest'
import { parsePagination } from './dashboard'

// parsePagination 은 ?page=&pageSize= 쿼리스트링을 Prisma 의 skip/take 로 변환한다.
// 가장 위험한 동작: 유효하지 않은 입력(NaN/음수/0)이 그대로 skip/take 로 흘러가면
// Prisma 쿼리가 깨지거나(NaN), 무제한 pageSize 로 과도한 row 를 긁는다.
// 아래 테스트는 "방어 가드 + 클램프 + skip 산술" 의 현재 동작을 고정한다.

describe('parsePagination', () => {
  it('입력 없으면 기본값 (page=1, pageSize=50)', () => {
    expect(parsePagination()).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
    expect(parsePagination(null, null)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('숫자가 아닌 page 는 1 로 안전하게 떨어진다 (NaN 이 skip 으로 새지 않음)', () => {
    expect(parsePagination('abc').page).toBe(1)
    expect(parsePagination('').page).toBe(1)
  })

  it('page < 1 (0, 음수) 은 1 로 보정된다', () => {
    expect(parsePagination('0').page).toBe(1)
    expect(parsePagination('-5').page).toBe(1)
  })

  it('소수 page 는 내림 처리된다 (skip/take 는 정수여야 함)', () => {
    expect(parsePagination('2.7').page).toBe(2)
  })

  it('pageSize 는 MIN(10) 으로 클램프된다 — 너무 작은 값', () => {
    expect(parsePagination('1', '5').pageSize).toBe(10)
  })

  it('pageSize 는 MAX(100) 으로 클램프된다 — 무제한 조회 방지', () => {
    expect(parsePagination('1', '500').pageSize).toBe(100)
  })

  it('유효하지 않은 pageSize(0/음수/NaN)는 기본값 50', () => {
    expect(parsePagination('1', '0').pageSize).toBe(50)
    expect(parsePagination('1', '-10').pageSize).toBe(50)
    expect(parsePagination('1', 'abc').pageSize).toBe(50)
  })

  it('skip = (page-1)*pageSize, take = pageSize', () => {
    expect(parsePagination('3', '20')).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 })
  })
})
