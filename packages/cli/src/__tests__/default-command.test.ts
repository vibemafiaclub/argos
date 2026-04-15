import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeDefaultCommand } from '../commands/default.js'
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

const MOCK_LOGIN_RESPONSE = {
  token: 'test-token',
  user: { id: 'user-1', email: 'test@example.com' },
}

const MOCK_CREATE_PROJECT_RESPONSE = {
  projectId: 'proj-1',
  orgId: 'org-1',
  orgName: 'Test Org',
  projectName: 'test-project',
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
      login: vi.fn().mockResolvedValue(MOCK_LOGIN_RESPONSE),
    },
    api: {
      createProject: vi.fn().mockResolvedValue(MOCK_CREATE_PROJECT_RESPONSE),
      joinOrg: vi.fn().mockResolvedValue(undefined),
      ensureMembership: vi.fn().mockResolvedValue(undefined),
      revokeToken: vi.fn().mockResolvedValue(undefined),
    },
    hooks: {
      inject: vi.fn().mockReturnValue('already_present'),
      fileExists: vi.fn().mockReturnValue(false),
    },
    prompt: {
      input: vi.fn().mockResolvedValue('test-project'),
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

describe('makeDefaultCommand', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Flow 1: config 없음 + project 없음 → Full Setup', () => {
    it('deps.auth.login 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.auth.login).toHaveBeenCalled()
    })

    it('deps.config.write 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.config.write).toHaveBeenCalled()
    })

    it('deps.api.createProject 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.api.createProject).toHaveBeenCalled()
    })

    it('deps.project.write 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.project.write).toHaveBeenCalled()
    })

    it('deps.hooks.inject 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.hooks.inject).toHaveBeenCalled()
    })
  })

  describe('Flow 2: config 없음 + project 있음 → Login & Join', () => {
    it('deps.auth.login 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(MOCK_PROJECT), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.auth.login).toHaveBeenCalled()
    })

    it('deps.api.joinOrg 이 project.orgId 인자와 함께 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(MOCK_PROJECT), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.api.joinOrg).toHaveBeenCalledWith(
        MOCK_PROJECT.orgId,
        expect.any(String),
        expect.any(String)
      )
    })

    it('deps.config.write 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(MOCK_PROJECT), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.config.write).toHaveBeenCalled()
    })

    it('deps.api.createProject 이 호출되지 않는다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(MOCK_PROJECT), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.api.createProject).not.toHaveBeenCalled()
    })
  })

  describe('Flow 3: config 있음 + project 없음 → Project Init', () => {
    it('deps.auth.login 이 호출되지 않는다 (이미 로그인)', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(MOCK_CONFIG), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.auth.login).not.toHaveBeenCalled()
    })

    it('deps.api.createProject 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(MOCK_CONFIG), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.api.createProject).toHaveBeenCalled()
    })

    it('deps.project.write 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(MOCK_CONFIG), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.project.write).toHaveBeenCalled()
    })

    it('deps.hooks.inject 이 호출된다', async () => {
      const deps = makeMockDeps({
        config: { read: vi.fn().mockReturnValue(MOCK_CONFIG), write: vi.fn(), delete: vi.fn() },
        project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
      })
      await makeDefaultCommand(deps)({})
      expect(deps.hooks.inject).toHaveBeenCalled()
    })
  })

  describe('Flow 4: config 있음 + project 있음 → Show Status', () => {
    it('deps.api.ensureMembership 이 호출된다', async () => {
      const deps = makeMockDeps()
      await makeDefaultCommand(deps)({})
      expect(deps.api.ensureMembership).toHaveBeenCalled()
    })

    it('deps.auth.login 이 호출되지 않는다', async () => {
      const deps = makeMockDeps()
      await makeDefaultCommand(deps)({})
      expect(deps.auth.login).not.toHaveBeenCalled()
    })

    it('deps.api.createProject 이 호출되지 않는다', async () => {
      const deps = makeMockDeps()
      await makeDefaultCommand(deps)({})
      expect(deps.api.createProject).not.toHaveBeenCalled()
    })
  })
})
