import 'server-only'

import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { db } from './db'
import { signJwt } from './jwt'

const ONBOARD_TOKEN_TTL_MS = 60 * 60 * 1000 // 1시간
const ONBOARD_TOKEN_PREFIX = 'argos_onb_'

export interface AuthResultUser {
  id: string
  email: string
  name: string
  createdAt: Date
}

export interface AuthResult {
  token: string
  user: AuthResultUser
}

async function issueAuthResultForUser(user: AuthResultUser): Promise<AuthResult> {
  const token = await signJwt(user.id)
  const tokenHash = createHash('sha256').update(token).digest('hex')

  await db.cliToken.create({
    data: {
      userId: user.id,
      tokenHash,
    },
  })

  return { token, user }
}

export async function issueUserAuthResult(userId: string): Promise<AuthResult | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true },
  })
  if (!user) return null

  return issueAuthResultForUser(user)
}

/**
 * 로그인 비즈니스 로직.
 * 자격 증명이 유효하면 새 JWT를 발급하고 CliToken을 생성한 뒤 반환한다.
 * 실패 시 null 반환 (호출 측에서 401 등으로 매핑).
 */
export async function loginUser(input: {
  email: string
  password: string
}): Promise<AuthResult | null> {
  const { email, password } = input

  const user = await db.user.findUnique({ where: { email } })
  if (!user) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  return issueAuthResultForUser({
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  })
}

/**
 * 가입 직후 복사되는 "argos setup --token=..." 프롬프트용 1회용 토큰을 발급한다.
 * 1시간 수명. exchangeOnboardToken으로 소비되면 usedAt이 찍혀 재사용 불가.
 */
export async function issueOnboardToken(userId: string): Promise<{
  token: string
  expiresAt: Date
}> {
  const token = ONBOARD_TOKEN_PREFIX + randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + ONBOARD_TOKEN_TTL_MS)
  await db.onboardToken.create({ data: { token, userId, expiresAt } })
  return { token, expiresAt }
}

/**
 * onboard token을 소비해 long-lived CLI JWT를 발급한다.
 * 실패 사유: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED'
 */
export async function exchangeOnboardToken(
  onboardToken: string
): Promise<AuthResult | 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED'> {
  const record = await db.onboardToken.findUnique({
    where: { token: onboardToken },
    include: { user: true },
  })
  if (!record) return 'NOT_FOUND'
  if (record.usedAt) return 'ALREADY_USED'
  if (new Date() > record.expiresAt) return 'EXPIRED'

  const updated = await db.onboardToken.updateMany({
    where: { token: onboardToken, usedAt: null },
    data: { usedAt: new Date() },
  })
  // updateMany의 count=0이면 동시 요청이 먼저 소비했다는 뜻
  if (updated.count === 0) return 'ALREADY_USED'

  return issueAuthResultForUser({
    id: record.user.id,
    email: record.user.email,
    name: record.user.name,
    createdAt: record.user.createdAt,
  })
}

/**
 * 회원가입 비즈니스 로직.
 * 이메일 중복 시 'EMAIL_IN_USE' 반환, 그 외에는 AuthResult.
 */
export async function registerUser(input: {
  email: string
  password: string
  name: string
}): Promise<AuthResult | 'EMAIL_IN_USE'> {
  const { email, password, name } = input

  const existingUser = await db.user.findUnique({ where: { email } })
  if (existingUser) return 'EMAIL_IN_USE'

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    const user = await db.user.create({
      data: { email, passwordHash, name },
    })

    return issueAuthResultForUser({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    })
  } catch (err) {
    // Race condition: concurrent registrations with same email — P2002 unique constraint
    const code = (err as { code?: string }).code
    if (code === 'P2002') return 'EMAIL_IN_USE'
    throw err
  }
}
