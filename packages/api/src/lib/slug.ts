import { db } from '@/db'

/**
 * 이름을 slug로 변환 (소문자, 공백→하이픈, 특수문자 제거)
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Organization slug 중복 시 suffix 추가 (-2, -3, ...)
 */
export async function generateUniqueOrgSlug(baseName: string): Promise<string> {
  const baseSlug = generateSlug(baseName)
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
 * Project slug 중복 시 suffix 추가 (org 내에서만 unique)
 */
export async function generateUniqueProjectSlug(baseName: string, orgId: string): Promise<string> {
  const baseSlug = generateSlug(baseName)
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
