/**
 * dashboard-pagination.test.ts — parsePagination 회귀 가드 (pure, DB 불필요)
 *
 * parsePagination 은 ?page=&pageSize= 쿼리스트링을 Prisma 의 skip/take 로 바꾸는 순수 함수다.
 * sessions/users 대시보드 라우트가 사용하며, pageSize clamp [10,100] 이 사실상의 DB-load
 * 가드다: 깨지면 `?pageSize=1000000` 같은 입력이 그대로 take 로 흘러가 DB 를 때린다.
 *
 * dashboard.ts 가 './db'(PrismaClient) 를 import 하지만 인스턴스화는 lazy 라
 * import 만으로는 커넥션이 열리지 않는다 (daily-rollup.test.ts 와 동일 패턴).
 *
 * 현재 동작을 고정한다. 깨지면 = 페이지네이션 계약 변경 = 잘못된 페이지 데이터 또는
 * clamp 무력화. Number() 기반 파싱(scientific notation 허용, NaN→default)과 floor 의미를
 * 명시적으로 잠근다.
 */
import { describe, it, expect } from 'vitest'
import { parsePagination } from './dashboard'

describe('parsePagination — 기본값', () => {
  it('인자 없음/빈 문자열 → page=1, pageSize=50', () => {
    expect(parsePagination()).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
    expect(parsePagination(null, null)).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
    // Number('') === 0 → page<1 / size<=0 이라 둘 다 default 로 떨어진다
    expect(parsePagination('', '')).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })

  it('파싱 불가(abc) → default 로 안전하게 떨어진다', () => {
    expect(parsePagination('abc', 'xyz')).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 })
  })
})

describe('parsePagination — page 정규화', () => {
  it('정상 page 는 skip = (page-1)*pageSize 로 환산', () => {
    expect(parsePagination('3', '20')).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 })
  })

  it('0·음수 page 는 1 로 보정', () => {
    expect(parsePagination('0', null).page).toBe(1)
    expect(parsePagination('-5', null).page).toBe(1)
  })

  it('소수 page 는 floor (반올림 아님): 2.9 → 2', () => {
    expect(parsePagination('2.9', '25.7')).toEqual({ page: 2, pageSize: 25, skip: 25, take: 25 })
  })
})

describe('parsePagination — pageSize clamp [10,100] (DB-load 가드)', () => {
  it('하한 미만은 10 으로 올림 (5 → 10)', () => {
    expect(parsePagination(null, '5').pageSize).toBe(10)
  })

  it('상한 초과는 100 으로 내림 (1000 → 100)', () => {
    // 이 clamp 가 깨지면 거대 take 가 DB 로 흘러간다.
    expect(parsePagination(null, '1000').pageSize).toBe(100)
  })

  it('경계값은 그대로 통과 (10, 100)', () => {
    expect(parsePagination(null, '10').pageSize).toBe(10)
    expect(parsePagination(null, '100').pageSize).toBe(100)
  })
})
