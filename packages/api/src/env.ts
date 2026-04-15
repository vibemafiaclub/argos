import { z } from 'zod'

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  WEB_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
})

export const env = EnvSchema.parse(process.env)
