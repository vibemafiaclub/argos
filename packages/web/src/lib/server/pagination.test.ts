import { describe, it, expect } from 'vitest'
import { parsePagination } from './dashboard'

// parsePagination 은 ?page=&pageSize= 쿼리를 DB 조회용 skip/take 로 바꾸는 순수 함수다.
// clamp 범위([10,100])나 skip=(page-1)*pageSize 공식이 깨지면 잘못된 데이터 페이지가
// 조용히 서빙되므로 경계와 폴백 동작을 고정한다.

describe('parsePagination — 기본값/폴백', () => {
  it('인자 없으면 page=1, pageSize=50, skip=0', () => {
    expect(parsePagination()).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('null 입력은 기본값으로 폴백한다', () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('숫자가 아닌 page 는 1 로 폴백한다', () => {
    expect(parsePagination('abc', '25').page).toBe(1)
  })

  it('0 또는 음수 pageSize 는 기본값 50 으로 폴백한다', () => {
    expect(parsePagination('1', '0').pageSize).toBe(50)
    expect(parsePagination('1', '-5').pageSize).toBe(50)
  })
})

describe('parsePagination — page 정규화', () => {
  it('1 미만(0, 음수)은 1 로 보정된다', () => {
    expect(parsePagination('0').page).toBe(1)
    expect(parsePagination('-3').page).toBe(1)
  })

  it('소수 page 는 내림된다', () => {
    expect(parsePagination('2.9').page).toBe(2)
  })
})

describe('parsePagination — pageSize clamp [10,100]', () => {
  it('10 미만은 10 으로 올려 clamp 한다', () => {
    expect(parsePagination('1', '5').pageSize).toBe(10)
  })

  it('100 초과는 100 으로 내려 clamp 한다', () => {
    expect(parsePagination('1', '500').pageSize).toBe(100)
  })

  it('경계값 10, 100 은 그대로 통과한다', () => {
    expect(parsePagination('1', '10').pageSize).toBe(10)
    expect(parsePagination('1', '100').pageSize).toBe(100)
  })

  it('소수 pageSize 는 내림 후 clamp 한다', () => {
    expect(parsePagination('1', '37.9').pageSize).toBe(37)
  })
})

describe('parsePagination — skip/take 계산', () => {
  it('skip = (page-1) * pageSize', () => {
    expect(parsePagination('3', '20')).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 })
  })

  it('take 는 항상 pageSize 와 같다', () => {
    const r = parsePagination('2', '15')
    expect(r.take).toBe(r.pageSize)
  })
})
