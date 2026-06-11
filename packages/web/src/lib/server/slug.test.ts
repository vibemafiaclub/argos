import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { generateSlug, generateUniqueOrgSlug, generateUniqueProjectSlug } from './slug'

vi.mock('./db', () => ({
  db: {
    organization: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
  },
}))

beforeEach(() => {
  vi.mocked(db.organization.findUnique).mockReset().mockResolvedValue(null)
  vi.mocked(db.project.findUnique).mockReset().mockResolvedValue(null)
})

describe('generateSlug', () => {
  it('소문자화 + 공백→하이픈 + 특수문자 제거', () => {
    expect(generateSlug('My Project')).toBe('my-project')
    expect(generateSlug('Hello,   World!')).toBe('hello-world')
    expect(generateSlug('ABC')).toBe('abc')
  })

  it('연속 하이픈은 1개로 합치고 앞뒤 하이픈은 제거한다', () => {
    expect(generateSlug('a--b---c')).toBe('a-b-c')
    expect(generateSlug('-abc-')).toBe('abc')
    expect(generateSlug('  spaced  out  ')).toBe('spaced-out')
  })

  it('영숫자가 하나도 남지 않으면 빈 문자열을 반환한다', () => {
    expect(generateSlug('한글만')).toBe('')
    expect(generateSlug('###')).toBe('')
    expect(generateSlug('---')).toBe('')
    expect(generateSlug('')).toBe('')
  })

  it('비ASCII 문자는 제거되고 ASCII 부분만 남는다', () => {
    expect(generateSlug('Café Münch')).toBe('caf-mnch')
    expect(generateSlug('한글 mixed 이름')).toBe('mixed')
  })
})

describe('generateUniqueOrgSlug', () => {
  it('충돌이 없으면 base slug 를 그대로 반환한다', async () => {
    await expect(generateUniqueOrgSlug('My Org')).resolves.toBe('my-org')
    expect(db.organization.findUnique).toHaveBeenCalledWith({ where: { slug: 'my-org' } })
  })

  it('충돌 시 -2, -3 suffix 를 순차적으로 시도한다', async () => {
    vi.mocked(db.organization.findUnique)
      .mockResolvedValueOnce({ id: 'org-a' } as never)
      .mockResolvedValueOnce({ id: 'org-b' } as never)
      .mockResolvedValueOnce(null)
    await expect(generateUniqueOrgSlug('My Org')).resolves.toBe('my-org-3')
    expect(db.organization.findUnique).toHaveBeenCalledTimes(3)
  })

  it('slug 로 변환 불가능한 이름은 org-<random 6자> 로 fallback 한다', async () => {
    const slug = await generateUniqueOrgSlug('한글만')
    expect(slug).toMatch(/^org-[a-z0-9]{6}$/)
  })
})

describe('generateUniqueProjectSlug', () => {
  it('org 범위에서 unique 조회한다', async () => {
    await expect(generateUniqueProjectSlug('My Proj', 'org-1')).resolves.toBe('my-proj')
    expect(db.project.findUnique).toHaveBeenCalledWith({
      where: { orgId_slug: { orgId: 'org-1', slug: 'my-proj' } },
    })
  })

  it('충돌 시 -2 suffix 를 붙인다', async () => {
    vi.mocked(db.project.findUnique)
      .mockResolvedValueOnce({ id: 'p-a' } as never)
      .mockResolvedValueOnce(null)
    await expect(generateUniqueProjectSlug('My Proj', 'org-1')).resolves.toBe('my-proj-2')
  })

  it('slug 로 변환 불가능한 이름은 project-<random 6자> 로 fallback 한다', async () => {
    const slug = await generateUniqueProjectSlug('###', 'org-1')
    expect(slug).toMatch(/^project-[a-z0-9]{6}$/)
  })
})
