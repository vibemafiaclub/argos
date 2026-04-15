import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeStatusCommand } from '../commands/status.js'
import type { ExternalDeps } from '../deps.js'

const MOCK_CONFIG = {
  token: 'test-token',
  apiUrl: 'https://api.example.com',
  userId: 'user-1',
  email: 'test@example.com',
}

const MOCK_PROJECT = {
  projectId: 'proj-1',
  orgId: 'org-1',
  orgName: 'Test Org',
  projectName: 'test-project',
  apiUrl: 'https://api.example.com',
}

function makeMockDeps(overrides: Partial<ExternalDeps> = {}): ExternalDeps {
  return {
    config: {
      read: vi.fn().mockReturnValue(MOCK_CONFIG),
      write: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      find: vi.fn().mockReturnValue(MOCK_PROJECT),
      write: vi.fn(),
    },
    auth: {
      login: vi.fn(),
    },
    api: {
      createProject: vi.fn(),
      joinOrg: vi.fn(),
      ensureMembership: vi.fn(),
      revokeToken: vi.fn(),
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

describe('makeStatusCommand', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('config 있음 + project 있음', () => {
    it('deps.config.read 가 호출된다', async () => {
      const deps = makeMockDeps()
      await makeStatusCommand(deps)({})
      expect(deps.config.read).toHaveBeenCalled()
    })

    it('deps.project.find 가 호출된다', async () => {
      const deps = makeMockDeps()
      await makeStatusCommand(deps)({})
      expect(deps.project.find).toHaveBeenCalled()
    })
  })

  describe('config 없음', () => {
    it('deps.config.read 가 null을 반환해도 에러 없이 완료된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
      })
      await expect(makeStatusCommand(deps)({})).resolves.toBeUndefined()
    })
  })

  describe('hooks 파일 존재 여부', () => {
    it('deps.hooks.fileExists 가 호출된다', async () => {
      const deps = makeMockDeps()
      await makeStatusCommand(deps)({})
      expect(deps.hooks.fileExists).toHaveBeenCalled()
    })
  })
})
