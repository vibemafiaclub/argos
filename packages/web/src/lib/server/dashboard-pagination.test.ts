import { describe, it, expect } from 'vitest'
import { parsePagination } from './dashboard'

// parsePagination 은 신뢰할 수 없는 ?page=&pageSize= 쿼리스트링을 Prisma 의
// skip/take 로 직접 변환한다. 여기서 고정하는 것은 "구현 세부"가 아니라
// "DB 쿼리를 보호하는 입력 검증 계약"이다:
//   - MAX clamp 가 사라지면 take 가 무제한이 되어 과중한 쿼리가 가능해진다.
//   - page>=1 가드가 사라지면 skip 이 음수가 되어 Prisma 가 깨진다.
// 둘 다 깨지면 의미 있게 알게 되는 회귀다.

describe('parsePagination — 기본값', () => {
  it('인자 없음 → page=1, pageSize=50, skip=0, take=50', () => {
    expect(parsePagination()).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('null/undefined 입력도 기본값으로 동작한다', () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('파싱 불가(NaN) 입력 → 기본값 page=1, pageSize=50', () => {
    expect(parsePagination('abc', 'xyz')).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })
})

describe('parsePagination — page 가드와 skip 산술', () => {
  it('정상 page → skip=(page-1)*pageSize', () => {
    const r = parsePagination('3', '20')
    expect(r).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 })
  })

  it('page<1 은 1 로 강제되어 skip 이 음수가 되지 않는다', () => {
    expect(parsePagination('0', '20').skip).toBe(0)
    expect(parsePagination('-5', '20')).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 })
  })

  it('소수 page 는 floor 된다 (2.9 → 2)', () => {
    expect(parsePagination('2.9', '20').page).toBe(2)
  })
})

describe('parsePagination — pageSize clamp [10, 100]', () => {
  it('MAX 초과 → 100 으로 clamp (무제한 take 방지)', () => {
    const r = parsePagination('1', '10000')
    expect(r.pageSize).toBe(100)
    expect(r.take).toBe(100)
  })

  it('MIN 미만 → 10 으로 clamp', () => {
    expect(parsePagination('1', '5').pageSize).toBe(10)
  })

  it('경계값은 그대로 유지된다 (10, 100)', () => {
    expect(parsePagination('1', '10').pageSize).toBe(10)
    expect(parsePagination('1', '100').pageSize).toBe(100)
  })

  it('0/음수 pageSize → 기본값 50', () => {
    expect(parsePagination('1', '0').pageSize).toBe(50)
    expect(parsePagination('1', '-20').pageSize).toBe(50)
  })

  it('소수 pageSize 는 floor 후 clamp 된다 (49.9 → 49)', () => {
    expect(parsePagination('1', '49.9').pageSize).toBe(49)
  })
})
