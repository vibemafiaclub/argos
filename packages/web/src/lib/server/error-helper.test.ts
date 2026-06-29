/**
 * error-helper 단위 테스트
 *
 * 대상: jsonError / handleRouteError (src/lib/server/error-helper.ts)
 * 추가 이유 (2026-06-26 일일 스캔, 결정 018 기준 "깨지면 의미 있는 것을 알게 되는" 곳):
 *   1. handleRouteError 의 zod duck-typing 분기는 load-bearing 이다 — 코드 주석대로
 *      번들에서 @argos/shared 와 web 이 서로 다른 zod 인스턴스를 참조하면
 *      `instanceof ZodError` 가 false 가 되고, name 기반 fallback 이 없으면
 *      모든 검증 에러가 조용히 400→500 으로 바뀐다. 이 분기가 깨지면 사용자에게
 *      "검증 실패" 대신 "서버 오류"가 나간다.
 *   2. 500 응답은 원본 에러 메시지를 누설하지 않아야 한다(정보 노출 방지).
 *   3. jsonError 의 { error: { code, message } } shape 은 클라이언트가
 *      `data.error?.message` 로 파싱하는 문서화된 계약(CLAUDE.md)이다.
 * 두 함수 모두 2026-06-25 시점 직전 commit(0aece9f)에서 도입/변경됐고 무방비였다.
 *
 * server-only 는 events.test.ts 와 동일하게 stub 처리한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z, ZodError } from 'zod'
import { jsonError, handleRouteError } from './error-helper'

vi.mock('server-only', () => ({}))

// handleRouteError 는 항상 console.error 로 로깅한다 — 테스트 출력만 조용히 한다(동작 무변경).
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('jsonError', () => {
  it('표준 { error: { code, message } } shape 과 status 를 반환한다', async () => {
    const res = jsonError('EMAIL_IN_USE', 'Email already in use', 409)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({ error: { code: 'EMAIL_IN_USE', message: 'Email already in use' } })
  })

  it('전달된 status 코드를 그대로 사용한다', async () => {
    const res = jsonError('GONE', 'expired', 410)
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error.code).toBe('GONE')
  })
})

describe('handleRouteError', () => {
  it('실제 ZodError 는 400 + VALIDATION_ERROR + details 로 매핑한다', async () => {
    const parsed = z.object({ a: z.string() }).safeParse({})
    expect(parsed.success).toBe(false)
    const res = handleRouteError((parsed as { error: ZodError }).error)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(Array.isArray(body.error.details)).toBe(true)
    expect(body.error.details.length).toBeGreaterThan(0)
  })

  it('instanceof 가 실패하는 duck-typed zod 에러(name="ZodError")도 400 으로 매핑한다', async () => {
    // 번들에서 zod 인스턴스가 갈리는 상황 재현: 진짜 ZodError 가 아니지만 name 만 일치.
    const fake = { name: 'ZodError', errors: [{ path: ['x'], message: 'bad' }] }
    expect(fake instanceof ZodError).toBe(false)
    const res = handleRouteError(fake)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toEqual([{ path: ['x'], message: 'bad' }])
  })

  it('일반 Error 는 500 + INTERNAL_ERROR 로 매핑한다', async () => {
    const res = handleRouteError(new Error('boom'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' })
  })

  it('500 응답에 원본 에러 메시지를 누설하지 않는다', async () => {
    const res = handleRouteError(new Error('postgres://user:secret@host/db connection failed'))
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('문자열 throw 는 crash 없이 500 으로 처리된다 (.code 접근이 안전한 경계)', async () => {
    const res = handleRouteError('plain string error')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })

  // TODO(bug): handleRouteError(null/undefined) 는 line 20 `(err as ...).code` 에서
  // TypeError 를 던진다 (commit 0aece9f 의 구조화 로깅이 도입한 회귀). 이전 구현
  // `console.error('Error:', err)` 은 null-safe 였다. 현재(버그) 동작을 고정한다 —
  // null-safe 로 고치면 이 테스트가 깨지며 알림이 된다. HEALTH.md R4 참조.
  it('null 입력은 현재 throw 한다 (TODO(bug): null-safe 가 아님)', () => {
    expect(() => handleRouteError(null)).toThrow()
  })
})
