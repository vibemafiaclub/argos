import { SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'

// env.ts 는 모듈 로드 시 process.env 전체(DATABASE_URL/ADMIN_* 등)를 zod parse 하므로
// 테스트 환경에선 import 만으로 throw 한다. jwt.ts 는 env.JWT_SECRET 만 쓰니
// env 모듈을 가볍게 mock 해 부작용을 차단한다(process.env 를 건드리지 않아 다른 test 로 새지 않음).
// 주의: vi.mock 은 hoist 되므로 factory 안에 secret 리터럴을 직접 둔다.
vi.mock('./env', () => ({ env: { JWT_SECRET: 'unit-test-jwt-secret-0123456789abcdef' } }))

import { signJwt, verifyJwt } from './jwt'

// jwt.ts 의 secretKey 와 동일한 바이트(위 mock 의 JWT_SECRET 와 일치해야 함).
const SECRET = 'unit-test-jwt-secret-0123456789abcdef'
const secretBytes = new TextEncoder().encode(SECRET)

/** jwt.ts 와 동일한 alg 로 임의 payload/secret 토큰을 위조해 verify 경로를 검증한다. */
async function forge(
  payload: Record<string, unknown>,
  opts: { secret?: Uint8Array; expSecondsFromNow?: number } = {},
): Promise<string> {
  const builder = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
  if (opts.expSecondsFromNow !== undefined) {
    builder.setExpirationTime(Math.floor(Date.now() / 1000) + opts.expSecondsFromNow)
  }
  return builder.sign(opts.secret ?? secretBytes)
}

describe('signJwt / verifyJwt', () => {
  it('서명한 토큰을 verify 하면 동일한 sub 를 돌려준다 (roundtrip)', async () => {
    const token = await signJwt('user-123')
    expect(token.split('.')).toHaveLength(3) // header.payload.signature
    await expect(verifyJwt(token)).resolves.toEqual({ sub: 'user-123' })
  })

  // 회귀 가드: commit 9d2221e — 같은 초에 두 번 발급해도 jti 덕분에 토큰이 달라야
  // token_hash UNIQUE 충돌(프로덕션 500)이 나지 않는다. setJti 가 사라지면 여기서 깨진다.
  it('같은 userId 라도 매 발급마다 다른 토큰을 만든다 (jti)', async () => {
    const a = await signJwt('user-123')
    const b = await signJwt('user-123')
    expect(a).not.toBe(b)
    // 그러나 두 토큰 모두 동일 sub 로 정상 verify 되어야 한다.
    await expect(verifyJwt(a)).resolves.toEqual({ sub: 'user-123' })
    await expect(verifyJwt(b)).resolves.toEqual({ sub: 'user-123' })
  })

  it('형식이 깨진 문자열은 null (throw 하지 않음)', async () => {
    await expect(verifyJwt('not-a-jwt')).resolves.toBeNull()
    await expect(verifyJwt('')).resolves.toBeNull()
  })

  it('다른 secret 으로 서명된(위조) 토큰은 null', async () => {
    const forged = await forge(
      { sub: 'attacker' },
      { secret: new TextEncoder().encode('a-different-secret-0123456789abcdef') },
    )
    await expect(verifyJwt(forged)).resolves.toBeNull()
  })

  it('만료된 토큰은 null', async () => {
    const expired = await forge({ sub: 'user-123' }, { expSecondsFromNow: -10 })
    await expect(verifyJwt(expired)).resolves.toBeNull()
  })

  it('sub 가 없는 토큰은 null', async () => {
    const noSub = await forge({ foo: 'bar' })
    await expect(verifyJwt(noSub)).resolves.toBeNull()
  })

  it('sub 가 문자열이 아니면 null', async () => {
    const numericSub = await forge({ sub: 123 })
    await expect(verifyJwt(numericSub)).resolves.toBeNull()
  })
})
