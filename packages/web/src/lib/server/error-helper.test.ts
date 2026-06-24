import { describe, it, expect, vi } from 'vitest'
import { ZodError } from 'zod'

// error-helper.ts 는 `import 'server-only'` 를 가져 Next 런타임 밖에서는 import 불가.
// events/route.test.ts 와 동일하게 stub 처리한다. (vi.mock 은 vitest 가 import 위로 호이스트)
vi.mock('server-only', () => ({}))

import { handleRouteError, jsonError } from './error-helper'

/**
 * 이 파일이 지키는 계약 (깨지면 의미 있는 것):
 *  - handleRouteError 는 CLAUDE.md / API 에러 규격이 약속한
 *    { error: { code, message } } shape 의 *단일* 500/400 진입점이다.
 *  - 두 라우트 테스트(events, skills)가 이 함수를 모두 vi.mock 으로 대체하므로
 *    실제 구현은 어디서도 실행되지 않는다 — 여기서만 직접 실행한다.
 *  - 특히 "name 기반 ZodError duck-typing" 분기는 @argos/shared 와 web 이
 *    번들에서 서로 다른 zod 인스턴스를 참조할 때 validation 에러가 조용히
 *    500 으로 떨어지는 것을 막으려고 존재한다(함수 주석 참조). 회귀하면
 *    프로덕션에서 400 이어야 할 검증 실패가 500 노이즈로 둔갑한다.
 */
describe('handleRouteError', () => {
  it('generic Error → 500 INTERNAL_ERROR, 내부 메시지를 클라이언트로 누출하지 않는다', async () => {
    const res = handleRouteError(new Error('db connection refused at 10.0.0.5'))
    expect(res.status).toBe(500)

    const body = await res.json()
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })
    // 회귀 가드: err.message 가 응답에 새어나가면 안 된다.
    expect(JSON.stringify(body)).not.toContain('10.0.0.5')
  })

  it('실제 ZodError(instanceof) → 400 VALIDATION_ERROR + details 전달', async () => {
    const zerr = new ZodError([
      { code: 'too_small', path: ['name'], message: 'too short', minimum: 1, type: 'string', inclusive: true } as never,
    ])
    const res = handleRouteError(zerr)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toEqual(zerr.errors)
  })

  it('번들 경계로 instanceof 가 깨진 ZodError(name 기반 duck-typing) → 여전히 400', async () => {
    // instanceof ZodError 가 false 인, 다른 zod 인스턴스에서 온 것처럼 보이는 객체.
    const issues = [{ code: 'invalid_type', path: ['email'], message: 'required' }]
    const fakeZod = { name: 'ZodError', errors: issues }

    expect(fakeZod instanceof ZodError).toBe(false) // 전제: instanceof 로는 못 잡는다

    const res = handleRouteError(fakeZod)
    // duck-typing 분기가 사라지면 이 단언이 500 을 받아 깨진다 — 그게 핵심 가드.
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toEqual(issues)
  })
})

describe('jsonError', () => {
  it('전달한 code/message/status 로 { error: { code, message } } 응답을 만든다', async () => {
    const res = jsonError('PROJECT_NOT_FOUND', 'Project not found', 404)
    expect(res.status).toBe(404)

    const body = await res.json()
    // 클라이언트는 data.error?.message 로 메시지를 뽑는다(CLAUDE.md) — 이 shape 가 계약.
    expect(body).toEqual({
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
    })
  })
})
