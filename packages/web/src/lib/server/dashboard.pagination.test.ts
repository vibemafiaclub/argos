import { describe, it, expect } from 'vitest'
import { parsePagination } from './dashboard'

// parsePagination 은 ?page=&pageSize= 쿼리스트링을 DB 쿼리의 skip/take 로 변환한다.
// 핵심 계약: pageSize 를 [10,100] 으로 clamp 한다 — 이 상한(100)이 무방비한 take 값
// (예: ?pageSize=99999 → take:99999) 으로 인한 과다 조회/메모리 압박을 막는 유일한 가드다.
// clamp 가 사라지면 조용히 DoS 표면이 열리므로, 이 테스트가 깨지면 의미 있는 회귀다.
// (dashboard.ts 는 db(PrismaClient) 만 import 하므로 쿼리 없이 안전하게 import 된다.)

describe('parsePagination — 기본값', () => {
  it('인자가 없으면 page=1, pageSize=50, skip=0, take=50', () => {
    expect(parsePagination()).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('null/undefined 도 동일하게 기본값으로 처리한다', () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
    expect(parsePagination(undefined, undefined)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })
})

describe('parsePagination — pageSize clamp [10,100] (남용 가드)', () => {
  it('상한 초과 요청은 100 으로 clamp 한다 (take 무한 증가 차단)', () => {
    const r = parsePagination(null, '99999')
    expect(r.pageSize).toBe(100)
    expect(r.take).toBe(100)
  })

  it('상한 경계값은 그대로 통과한다', () => {
    expect(parsePagination(null, '100').pageSize).toBe(100)
  })

  it('하한 미만의 양수는 10 으로 끌어올린다', () => {
    expect(parsePagination(null, '1').pageSize).toBe(10)
    expect(parsePagination(null, '9').pageSize).toBe(10)
  })

  it('하한 경계값은 그대로 통과한다', () => {
    expect(parsePagination(null, '10').pageSize).toBe(10)
  })

  it('0/음수/NaN pageSize 는 기본값 50 으로 떨어진다', () => {
    expect(parsePagination(null, '0').pageSize).toBe(50)
    expect(parsePagination(null, '-10').pageSize).toBe(50)
    expect(parsePagination(null, 'abc').pageSize).toBe(50)
  })

  it('소수 pageSize 는 내림 후 clamp 한다', () => {
    expect(parsePagination(null, '20.7').pageSize).toBe(20)
  })
})

describe('parsePagination — page 정규화와 skip 계산', () => {
  it('1 미만/비숫자 page 는 1 로 정규화한다', () => {
    expect(parsePagination('0').page).toBe(1)
    expect(parsePagination('-5').page).toBe(1)
    expect(parsePagination('abc').page).toBe(1)
  })

  it('소수 page 는 내림한다', () => {
    expect(parsePagination('2.9').page).toBe(2)
  })

  it('skip = (page-1) * pageSize, take = pageSize', () => {
    expect(parsePagination('3', '20')).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 })
    expect(parsePagination('1', '10')).toEqual({ page: 1, pageSize: 10, skip: 0, take: 10 })
  })
})
