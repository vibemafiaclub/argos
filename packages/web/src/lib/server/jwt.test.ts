import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'crypto'
import { SignJWT } from 'jose'

// jwt.ts → env.ts 는 import 시점에 process.env 를 zod 로 parse 하므로,
// 그대로 두면 vitest 에서 모듈 로드 자체가 실패한다.
// env 모듈을 고정 시크릿으로 대체한다 — 설정값 주입일 뿐 동작 mock 이 아니다.
// (vi.mock 은 vitest 가 import 위로 hoist 하므로 아래 static import 보다 먼저 적용된다.
//  hoist 때문에 factory 안에서 외부 변수를 참조할 수 없어 시크릿을 리터럴로 인라인한다.)
vi.mock('./env', () => ({
  env: { JWT_SECRET: 'test-jwt-secret-please-ignore-0123456789' }, // 40 chars, ≥32 요구 충족
}))

import { signJwt, verifyJwt } from './jwt'

// auth-actions.ts 가 CliToken.tokenHash 를 만들 때 쓰는 것과 동일한 해시.
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

describe('signJwt / verifyJwt — auth 경계', () => {
  it('signJwt 가 발급한 토큰을 verifyJwt 가 검증하고 sub(userId)를 그대로 돌려준다', async () => {
    const token = await signJwt('user-abc-123')
    expect(await verifyJwt(token)).toEqual({ sub: 'user-abc-123' })
  })

  it('다른 시크릿으로 서명된 토큰은 거부한다 (서명을 실제로 검증 — decode-only 로 다운그레이드되면 깨짐)', async () => {
    // 페이로드는 멀쩡하지만 우리 시크릿이 아닌 키로 서명된 위조 토큰.
    // verifyJwt 가 jose.jwtVerify(서명검증) 대신 jose.decodeJwt(검증없음) 로 바뀌면
    // 이 토큰이 통과되어 테스트가 깨진다 — 흔한 인증 우회 회귀를 잡는다.
    const forged = await new SignJWT({ sub: 'user-abc-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(new TextEncoder().encode('a-completely-different-secret-0123456789'))
    expect(await verifyJwt(forged)).toBeNull()
  })

  it('형식이 깨진 입력은 throw 하지 않고 null 을 돌려준다', async () => {
    expect(await verifyJwt('not-a-jwt')).toBeNull()
    expect(await verifyJwt('')).toBeNull()
  })
})

describe('signJwt — CliToken.tokenHash UNIQUE 충돌 회귀 가드', () => {
  it('같은 user 로 연속 발급해도 매번 토큰과 해시가 달라야 한다', async () => {
    // 회귀 배경(commit 9d2221e): 같은 초에 같은 user 로 두 번 서명하면 iat/sub/exp 가
    // 동일해 JWT 가 byte-identical → sha256 동일 → CliToken.tokenHash UNIQUE 위반으로
    // 회원가입 직후 자동로그인이 500 으로 터졌다. jwt.ts 의 .setJti(randomBytes) 가 수정.
    // Promise.all 로 같은 tick(=같은 초)에 두 번 서명해 그 조건을 강제한다 —
    // .setJti 를 제거하면 두 토큰이 동일해져 이 테스트가 깨진다 (mutation 으로 확인함).
    const [a, b] = await Promise.all([signJwt('user-same'), signJwt('user-same')])
    expect(a).not.toBe(b)
    expect(sha256(a)).not.toBe(sha256(b))
  })
})
