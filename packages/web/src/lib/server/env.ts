import { z } from 'zod'

// 서버 전용 환경변수 (NextAuth용 AUTH_SECRET은 별도로 next-auth 내부에서 처리)
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  // Separate secret for admin HMAC cookie signing.
  // Falls back to JWT_SECRET if unset (backwards compat), but should be rotated independently.
  ADMIN_COOKIE_SECRET: z.string().min(32).optional(),
  ADMIN_USERNAME: z.string().min(1).max(128).refine((value) => !value.includes('.'), {
    message: 'ADMIN_USERNAME must not contain "."',
  }),
  ADMIN_PASSWORD: z.string().min(16).max(512),
})

const _parsed = EnvSchema.parse(process.env)

// Resolve admin cookie secret once so admin-auth.ts has no JWT_SECRET reference.
export const env = {
  ..._parsed,
  ADMIN_COOKIE_SECRET: _parsed.ADMIN_COOKIE_SECRET ?? _parsed.JWT_SECRET,
}
