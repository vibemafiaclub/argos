/**
 * WU-2: transferProjectForUser 단위 테스트
 *
 * 검증 시나리오:
 *   1. ok — 정상 transfer
 *   2. not_found (project 없음)
 *   3. not_found (targetOrg 없음)
 *   4. forbidden — 출발 org OWNER 아님
 *   5. forbidden — 대상 org OWNER 아님
 *   6. slug_conflict — (orgId, slug) P2002
 *   7. same_org — 출발 == 대상, 트랜잭션 skip
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma, OrgRole } from '@prisma/client'

// server-only 는 Next.js 런타임 전용 모듈 — 테스트 환경에서 stub 처리
vi.mock('server-only', () => ({}))

// db 모듈 전체 mock
vi.mock('./db', () => {
  const db = {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    orgMembership: {
      findUnique: vi.fn(),
    },
    projectMember: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  return { db }
})

import { db } from './db'
import { transferProjectForUser } from './project-actions'

// 테스트용 공통 픽스처
const PROJECT_ID = 'proj-1'
const USER_ID = 'user-1'
const SOURCE_ORG_ID = 'org-a'
const SOURCE_ORG_SLUG = 'org-a'
const TARGET_ORG_ID = 'org-b'
const TARGET_ORG_SLUG = 'org-b'

const BASE_PROJECT = {
  id: PROJECT_ID,
  orgId: SOURCE_ORG_ID,
  name: 'Demo Project',
  slug: 'demo',
  createdAt: new Date('2024-01-01'),
  organization: {
    id: SOURCE_ORG_ID,
    slug: SOURCE_ORG_SLUG,
    memberships: [{ role: 'OWNER' as OrgRole }],
  },
}

const BASE_TARGET_ORG = {
  id: TARGET_ORG_ID,
  slug: TARGET_ORG_SLUG,
  memberships: [{ role: 'OWNER' as OrgRole }],
}

const UPDATED_PROJECT = {
  id: PROJECT_ID,
  orgId: TARGET_ORG_ID,
  name: 'Demo Project',
  slug: 'demo',
  createdAt: new Date('2024-01-01'),
}

// tx 객체 타입: db.$transaction 콜백에 주입되는 Prisma 트랜잭션 클라이언트의 최소 타입
type TxClient = {
  orgMembership: { findUnique: ReturnType<typeof vi.fn> }
  projectMember: { deleteMany: ReturnType<typeof vi.fn> }
  project: { update: ReturnType<typeof vi.fn> }
}

/** db.$transaction callback form 을 실제 실행하는 helper */
function setupTransactionCallbackRunner() {
  ;(db.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (arg: unknown) => {
      if (typeof arg === 'function') {
        // callback form: tx 객체를 주입해 실행
        const tx: TxClient = {
          orgMembership: { findUnique: vi.fn() },
          projectMember: { deleteMany: vi.fn() },
          project: { update: vi.fn() },
        }
        // 기본 stub: 둘 다 OWNER
        vi.mocked(tx.orgMembership.findUnique)
          .mockResolvedValueOnce({ role: 'OWNER' as OrgRole }) // sourceM
          .mockResolvedValueOnce({ role: 'OWNER' as OrgRole }) // targetM
        vi.mocked(tx.projectMember.deleteMany).mockResolvedValue({ count: 2 })
        vi.mocked(tx.project.update).mockResolvedValue(UPDATED_PROJECT)
        return (arg as (tx: TxClient) => Promise<unknown>)(tx)
      }
      return arg
    }
  )
}

describe('transferProjectForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── 시나리오 1: ok ───────────────────────────────────────────────────
  it('ok — 정상 transfer: Project.orgId 갱신, orgSlug 반환', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(
      BASE_PROJECT as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      BASE_TARGET_ORG as unknown as Awaited<ReturnType<typeof db.organization.findUnique>>
    )
    setupTransactionCallbackRunner()

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.project.orgId).toBe(TARGET_ORG_ID)
      expect(result.project.orgSlug).toBe(TARGET_ORG_SLUG)
      expect(result.project.slug).toBe('demo')
    }
    // 트랜잭션이 한 번 호출되었는지 확인
    expect(db.$transaction).toHaveBeenCalledOnce()
  })

  // ─── 시나리오 2: not_found (project 없음) ────────────────────────────
  it('not_found — projectId 에 해당하는 project 가 없음', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(null)

    const result = await transferProjectForUser('nonexistent', USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('not_found')
    expect(db.organization.findUnique).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  // ─── 시나리오 3: not_found (targetOrg 없음) ──────────────────────────
  it('not_found — targetOrgSlug 에 해당하는 org 가 없음', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(
      BASE_PROJECT as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )
    vi.mocked(db.organization.findUnique).mockResolvedValue(null)

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: 'does-not-exist',
    })

    expect(result.kind).toBe('not_found')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  // ─── 시나리오 4: forbidden — 출발 org OWNER 아님 ─────────────────────
  it('forbidden — 출발 org 에서 OWNER 가 아닌 경우 (MEMBER)', async () => {
    const projectWithMember = {
      ...BASE_PROJECT,
      organization: {
        ...BASE_PROJECT.organization,
        memberships: [{ role: 'MEMBER' as OrgRole }],
      },
    }
    vi.mocked(db.project.findUnique).mockResolvedValue(
      projectWithMember as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('forbidden')
    expect(db.organization.findUnique).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('forbidden — 출발 org 에 멤버십 없음', async () => {
    const projectNoMembership = {
      ...BASE_PROJECT,
      organization: {
        ...BASE_PROJECT.organization,
        memberships: [] as { role: OrgRole }[],
      },
    }
    vi.mocked(db.project.findUnique).mockResolvedValue(
      projectNoMembership as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('forbidden')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  // ─── 시나리오 5: forbidden — 대상 org OWNER 아님 ─────────────────────
  it('forbidden — 대상 org 에서 OWNER 가 아닌 경우 (MANAGER)', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(
      BASE_PROJECT as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )
    const targetOrgAsManager = {
      ...BASE_TARGET_ORG,
      memberships: [{ role: 'MANAGER' as OrgRole }],
    }
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      targetOrgAsManager as unknown as Awaited<ReturnType<typeof db.organization.findUnique>>
    )

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('forbidden')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  // ─── 시나리오 6: slug_conflict — P2002 ───────────────────────────────
  it('slug_conflict — 대상 org 에 동일 slug 프로젝트 존재 (P2002)', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(
      BASE_PROJECT as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      BASE_TARGET_ORG as unknown as Awaited<ReturnType<typeof db.organization.findUnique>>
    )

    // P2002 에러 생성 (target 에 orgId/slug 인덱스 포함)
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`org_id`,`slug`)',
      {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['org_id', 'slug'] },
      }
    )

    vi.mocked(db.$transaction).mockRejectedValue(p2002)

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('slug_conflict')
  })

  it('slug_conflict — Prisma 6 camelCase field array (orgId,slug)', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(
      BASE_PROJECT as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      BASE_TARGET_ORG as unknown as Awaited<ReturnType<typeof db.organization.findUnique>>
    )

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`orgId`,`slug`)',
      {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { target: ['orgId', 'slug'] },
      }
    )

    vi.mocked(db.$transaction).mockRejectedValue(p2002)

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('slug_conflict')
  })

  it('slug_conflict — Prisma 6 actual index name (projects_orgId_slug_key)', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(
      BASE_PROJECT as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      BASE_TARGET_ORG as unknown as Awaited<ReturnType<typeof db.organization.findUnique>>
    )

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the constraint: `projects_orgId_slug_key`',
      {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { target: 'projects_orgId_slug_key' },
      }
    )

    vi.mocked(db.$transaction).mockRejectedValue(p2002)

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('slug_conflict')
  })

  it('slug_conflict — P2002 target 이 string 형태인 경우도 처리', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(
      BASE_PROJECT as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      BASE_TARGET_ORG as unknown as Awaited<ReturnType<typeof db.organization.findUnique>>
    )

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the constraint: `Project_orgId_slug_key`',
      {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: 'Project_org_id_slug_key' },
      }
    )

    vi.mocked(db.$transaction).mockRejectedValue(p2002)

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('slug_conflict')
  })

  it('P2002 이지만 (orgId, slug) 인덱스가 아니면 re-throw', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(
      BASE_PROJECT as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      BASE_TARGET_ORG as unknown as Awaited<ReturnType<typeof db.organization.findUnique>>
    )

    const p2002Other = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`name`)',
      {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['name'] },
      }
    )

    vi.mocked(db.$transaction).mockRejectedValue(p2002Other)

    await expect(
      transferProjectForUser(PROJECT_ID, USER_ID, {
        targetOrgSlug: TARGET_ORG_SLUG,
      })
    ).rejects.toThrow()
  })

  // ─── 시나리오 7: same_org ────────────────────────────────────────────
  it('same_org — 출발 == 대상 org: 트랜잭션 skip, 현재 project 반환', async () => {
    // 대상 orgSlug 가 출발 org slug 와 동일
    const projectSameOrg = {
      ...BASE_PROJECT,
      orgId: SOURCE_ORG_ID,
      organization: {
        id: SOURCE_ORG_ID,
        slug: SOURCE_ORG_SLUG,
        memberships: [{ role: 'OWNER' as OrgRole }],
      },
    }
    vi.mocked(db.project.findUnique).mockResolvedValue(
      projectSameOrg as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )

    // 대상 org 조회 시 동일한 org 반환 (같은 ID)
    const targetOrgSame = {
      id: SOURCE_ORG_ID,
      slug: SOURCE_ORG_SLUG,
      memberships: [{ role: 'OWNER' as OrgRole }],
    }
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      targetOrgSame as unknown as Awaited<ReturnType<typeof db.organization.findUnique>>
    )

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: SOURCE_ORG_SLUG,
    })

    expect(result.kind).toBe('same_org')
    if (result.kind === 'same_org') {
      expect(result.project.orgId).toBe(SOURCE_ORG_ID)
      expect(result.project.orgSlug).toBe(SOURCE_ORG_SLUG)
    }
    // 트랜잭션이 호출되지 않아야 한다 (ProjectMember 보존)
    expect(db.$transaction).not.toHaveBeenCalled()
    // DB write 도 없어야 한다
    expect(db.project.update).not.toHaveBeenCalled()
    expect(db.projectMember.deleteMany).not.toHaveBeenCalled()
  })

  // ─── 트랜잭션 내 race 조건 (forbidden_race) ───────────────────────────
  it('forbidden_race — 트랜잭션 중 권한 강등 시 forbidden 반환', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue(
      BASE_PROJECT as unknown as Awaited<ReturnType<typeof db.project.findUnique>>
    )
    vi.mocked(db.organization.findUnique).mockResolvedValue(
      BASE_TARGET_ORG as unknown as Awaited<ReturnType<typeof db.organization.findUnique>>
    )

    // 트랜잭션 내에서 sourceM 이 OWNER 가 아닌 상황 시뮬레이션
    ;(db.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (arg: unknown) => {
        if (typeof arg === 'function') {
          const tx: TxClient = {
            orgMembership: { findUnique: vi.fn() },
            projectMember: { deleteMany: vi.fn() },
            project: { update: vi.fn() },
          }
          // 강등: source 가 MEMBER 로 바뀜
          vi.mocked(tx.orgMembership.findUnique)
            .mockResolvedValueOnce({ role: 'MEMBER' as OrgRole }) // sourceM 강등
            .mockResolvedValueOnce({ role: 'OWNER' as OrgRole })  // targetM
          return (arg as (tx: TxClient) => Promise<unknown>)(tx)
        }
      }
    )

    const result = await transferProjectForUser(PROJECT_ID, USER_ID, {
      targetOrgSlug: TARGET_ORG_SLUG,
    })

    expect(result.kind).toBe('forbidden')
  })
})
