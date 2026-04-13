import { Context } from 'hono'
import { ZodError } from 'zod'

export function errorHandler(err: Error, c: Context) {
  console.error('Error:', err)

  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation error',
          details: err.errors
        }
      },
      400
    )
  }

  // 기본 내부 서버 오류
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    },
    500
  )
}
