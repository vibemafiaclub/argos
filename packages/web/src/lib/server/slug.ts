import { randomBytes } from 'crypto'
import { db } from './db'

/**
 * 짧은 영숫자 random suffix 생성 (slug fallback 및 충돌 회피용)
 */
function randomSuffix(length = 6): string {
  // base36 charset (0-9a-z), length 자릿수
  return randomBytes(length)
    .toString('base64')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, length)
    .padEnd(length, '0')
}

/**
 * 이름을 slug로 변환 (소문자, 공백→하이픈, 특수문자 제거).
 * 결과에 [a-z0-9] 가 하나도 없으면 (예: 한글만 입력, "###" 같은 기호) 빈 문자열을 반환.
 */
export function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  // 문자/숫자가 하나도 없다면 의미 있는 slug 가 아니므로 empty 로 간주
  if (!/[a-z0-9]/.test(slug)) return ''
  return slug
}

/**
 * Organization slug 중복 시 suffix 추가 (-2, -3, ...).
 * 입력 이름이 slug 로 변환했을 때 비어있다면 `org-<random>` 형태로 fallback.
 */
export async function generateUniqueOrgSlug(baseName: string): Promise<string> {
  const baseSlug = generateSlug(baseName) || `org-${randomSuffix()}`
  let slug = baseSlug
  let suffix = 2

  while (true) {
    const existing = await db.organization.findUnique({ where: { slug } })
    if (!existing) return slug
    slug = `${baseSlug}-${suffix}`
    suffix++
  }
}

/**
 * Project slug 중복 시 suffix 추가 (org 내에서만 unique).
 * 입력 이름이 slug 로 변환했을 때 비어있다면 `project-<random>` 형태로 fallback.
 */
export async function generateUniqueProjectSlug(baseName: string, orgId: string): Promise<string> {
  const baseSlug = generateSlug(baseName) || `project-${randomSuffix()}`
  let slug = baseSlug
  let suffix = 2

  while (true) {
    const existing = await db.project.findUnique({
      where: { orgId_slug: { orgId, slug } }
    })
    if (!existing) return slug
    slug = `${baseSlug}-${suffix}`
    suffix++
  }
}
