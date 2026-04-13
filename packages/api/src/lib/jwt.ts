import { SignJWT, jwtVerify } from 'jose'
import { env } from '@/env'

const JWT_EXPIRATION = 365 * 24 * 60 * 60 // 1년 (초)

const secretKey = new TextEncoder().encode(env.JWT_SECRET)

export async function signJwt(userId: string): Promise<string> {
  const jwt = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + JWT_EXPIRATION)
    .sign(secretKey)

  return jwt
}

export async function verifyJwt(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey)

    if (!payload.sub || typeof payload.sub !== 'string') {
      return null
    }

    return { sub: payload.sub }
  } catch {
    return null
  }
}
