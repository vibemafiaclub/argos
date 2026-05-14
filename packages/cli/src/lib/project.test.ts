import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { findProjectConfigWithPath, writeProjectConfig } from './project.js'

const originalCwd = process.cwd()

afterEach(() => {
  process.chdir(originalCwd)
})

describe('findProjectConfigWithPath', () => {
  it('resolves relative startDir segments before walking parent directories', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'argos-project-test-'))

    try {
      const repoRoot = join(tmpRoot, 'repo')
      const nestedDir = join(repoRoot, 'packages', 'cli')
      mkdirSync(nestedDir, { recursive: true })
      writeProjectConfig({
        projectId: 'project-1',
        orgId: 'org-1',
        orgName: 'Org',
        projectName: 'Project',
      }, repoRoot)

      process.chdir(repoRoot)

      const result = findProjectConfigWithPath('packages/../packages/cli')

      expect(result?.config.projectId).toBe('project-1')
      expect(result?.configPath).toBe(realpathSync(resolve(repoRoot, '.argos', 'project.json')))
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})
