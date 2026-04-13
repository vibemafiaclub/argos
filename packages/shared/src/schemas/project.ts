import { z } from 'zod'

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  orgId: z.string().optional(),
})

export const JoinOrgSchema = z.object({
  orgId: z.string(),
})
