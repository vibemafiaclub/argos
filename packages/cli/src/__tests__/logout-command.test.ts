import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeLogoutCommand } from '../commands/logout.js'
import type { ExternalDeps } from '../deps.js'

const MOCK_CONFIG = {
  token: 'test-token',
  apiUrl: 'https://api.example.com',
  userId: 'user-1',
  email: 'test@example.com',
}

function makeMockDeps(overrides: Partial<ExternalDeps> = {}): ExternalDeps {
  return {
    config: {
      read: vi.fn().mockReturnValue(MOCK_CONFIG),
      write: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      find: vi.fn().mockReturnValue(null),
      write: vi.fn(),
    },
    auth: {
      login: vi.fn(),
    },
    api: {
      createProject: vi.fn(),
      joinOrg: vi.fn(),
      ensureMembership: vi.fn(),
      revokeToken: vi.fn().mockResolvedValue(undefined),
    },
    hooks: {
      inject: vi.fn().mockReturnValue('already_present'),
      fileExists: vi.fn().mockReturnValue(false),
    },
    prompt: {
      input: vi.fn(),
    },
    transcript: {
      extractUsage: vi.fn().mockResolvedValue(null),
      detectSlashCommand: vi.fn().mockResolvedValue(null),
      extractMessages: vi.fn().mockResolvedValue([]),
    },
    events: {
      sendBackground: vi.fn(),
    },
    cwd: vi.fn().mockReturnValue('/test/cwd'),
    ...overrides,
  } as ExternalDeps
}

describe('makeLogoutCommand', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('정상 로그아웃', () => {
    it('config가 있으면 deps.api.revokeToken 이 호출된다', async () => {
      const deps = makeMockDeps()
      await makeLogoutCommand(deps)({})
      expect(deps.api.revokeToken).toHaveBeenCalledWith(MOCK_CONFIG.token, MOCK_CONFIG.apiUrl)
    })

    it('deps.config.delete 이 호출된다', async () => {
      const deps = makeMockDeps()
      await makeLogoutCommand(deps)({})
      expect(deps.config.delete).toHaveBeenCalled()
    })
  })

  describe('로그인 안 된 상태', () => {
    it('config가 null이면 deps.api.revokeToken 이 호출되지 않는다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
      })
      await makeLogoutCommand(deps)({})
      expect(deps.api.revokeToken).not.toHaveBeenCalled()
    })

    it('config가 null이면 deps.config.delete 이 호출되지 않는다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
      })
      await makeLogoutCommand(deps)({})
      expect(deps.config.delete).not.toHaveBeenCalled()
    })
  })

  describe('서버 revokeToken 실패해도', () => {
    it('deps.api.revokeToken 이 throw해도 deps.config.delete 는 호출된다', async () => {
      const deps = makeMockDeps({
        api: {
          createProject: vi.fn(),
          joinOrg: vi.fn(),
          ensureMembership: vi.fn(),
          revokeToken: vi.fn().mockRejectedValue(new Error('server error')),
        },
      })
      await makeLogoutCommand(deps)({})
      expect(deps.config.delete).toHaveBeenCalled()
    })
  })
})
