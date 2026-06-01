import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeSetupCommand } from '../commands/setup.js'
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
  orgSlug: 'test-org',
  orgName: 'Test Org',
  projectName: 'test-project',
  apiUrl: 'https://api.example.com',
}

const MOCK_EXCHANGE_RESPONSE = {
  token: 'exchanged-token',
  user: {
    id: 'user-2',
    email: 'joined@example.com',
    name: 'Joined User',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
}

const MOCK_CREATE_PROJECT_RESPONSE = {
  projectId: 'proj-2',
  orgId: 'org-2',
  orgSlug: 'new-org',
  orgName: 'New Org',
  projectName: 'new-project',
  projectSlug: 'new-project',
}

function makeMockDeps(overrides: Partial<ExternalDeps> = {}): ExternalDeps {
  return {
    config: {
      read: vi.fn().mockReturnValue(null),
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
      exchange: vi.fn().mockResolvedValue(MOCK_EXCHANGE_RESPONSE),
      createProject: vi.fn().mockResolvedValue(MOCK_CREATE_PROJECT_RESPONSE),
      joinOrg: vi.fn().mockResolvedValue(undefined),
      ensureMembership: vi.fn().mockResolvedValue(undefined),
      revokeToken: vi.fn().mockResolvedValue(undefined),
    },
    hooks: {
      inject: vi.fn().mockReturnValue('already_present'),
      fileExists: vi.fn().mockReturnValue(true),
    },
    prompt: {
      input: vi.fn(),
    },
    transcript: {
      extractUsage: vi.fn().mockResolvedValue(null),
      extractUsagePerTurn: vi.fn().mockResolvedValue([]),
      detectSlashCommand: vi.fn().mockResolvedValue(null),
      extractMessages: vi.fn().mockResolvedValue([]),
      extractSummary: vi.fn().mockResolvedValue(null),
    },
    events: {
      sendBackground: vi.fn(),
    },
    cwd: vi.fn().mockReturnValue('/test/cwd'),
    ...overrides,
  } as ExternalDeps
}

describe('makeSetupCommand', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('기존 project.json 이 있으면 onboard token으로 로그인 후 프로젝트 생성 없이 org 합류만 수행한다', async () => {
    const deps = makeMockDeps({
      project: {
        find: vi.fn().mockReturnValue(MOCK_PROJECT),
        write: vi.fn(),
      },
    })

    await makeSetupCommand(deps)({ token: 'argos_onb_test' })

    expect(deps.api.exchange).toHaveBeenCalledWith('argos_onb_test', MOCK_PROJECT.apiUrl)
    expect(deps.config.write).toHaveBeenCalledWith({
      token: MOCK_EXCHANGE_RESPONSE.token,
      userId: MOCK_EXCHANGE_RESPONSE.user.id,
      email: MOCK_EXCHANGE_RESPONSE.user.email,
      apiUrl: MOCK_PROJECT.apiUrl,
    })
    expect(deps.api.joinOrg).toHaveBeenCalledWith(
      MOCK_PROJECT.orgSlug,
      MOCK_EXCHANGE_RESPONSE.token,
      MOCK_PROJECT.apiUrl
    )
    expect(deps.api.createProject).not.toHaveBeenCalled()
    expect(deps.project.write).not.toHaveBeenCalled()
    expect(deps.hooks.inject).toHaveBeenCalled()
  })

  it('이미 로그인과 project.json 이 모두 있으면 token 없이도 no-op 연결 확인만 수행한다', async () => {
    const deps = makeMockDeps({
      config: {
        read: vi.fn().mockReturnValue(MOCK_CONFIG),
        write: vi.fn(),
        delete: vi.fn(),
      },
      project: {
        find: vi.fn().mockReturnValue(MOCK_PROJECT),
        write: vi.fn(),
      },
    })

    await makeSetupCommand(deps)({})

    expect(deps.api.exchange).not.toHaveBeenCalled()
    expect(deps.config.write).not.toHaveBeenCalled()
    expect(deps.api.joinOrg).toHaveBeenCalledWith(
      MOCK_PROJECT.orgSlug,
      MOCK_CONFIG.token,
      MOCK_PROJECT.apiUrl
    )
    expect(deps.api.createProject).not.toHaveBeenCalled()
    expect(deps.project.write).not.toHaveBeenCalled()
  })

  it('project.json 이 없으면 기존처럼 프로젝트를 생성한다', async () => {
    const deps = makeMockDeps()

    await makeSetupCommand(deps)({ token: 'argos_onb_test' })

    expect(deps.api.exchange).toHaveBeenCalled()
    expect(deps.api.createProject).toHaveBeenCalled()
    expect(deps.project.write).toHaveBeenCalled()
  })
})
