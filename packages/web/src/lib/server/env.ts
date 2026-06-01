import { z } from 'zod'

// 서버 전용 환경변수 (NextAuth용 AUTH_SECRET은 별도로 next-auth 내부에서 처리)
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
})

export const env = EnvSchema.parse(process.env)
