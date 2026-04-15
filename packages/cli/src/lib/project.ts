import { dirname, join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

export interface ProjectConfig {
  projectId: string
  orgId: string
  orgName: string
  projectName: string
  apiUrl: string
}

/**
 * Find .argos/project.json by traversing up from startDir
 * @param startDir Starting directory (defaults to process.cwd())
 * @returns ProjectConfig or null if not found
 */
export function findProjectConfig(startDir?: string): ProjectConfig | null {
  let currentDir = startDir || process.cwd()
  let depth = 0
  const maxDepth = 10

  while (depth < maxDepth) {
    const configPath = join(currentDir, '.argos', 'project.json')
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf8')
        return JSON.parse(content) as ProjectConfig
      } catch {
        return null
      }
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      // Reached root directory
      break
    }
    currentDir = parentDir
    depth++
  }

  return null
}

/**
 * Write project config to dir/.argos/project.json
 * Also creates .argos/.gitignore with a comment (but doesn't actually ignore the directory)
 * @param config Project configuration
 * @param dir Target directory (defaults to process.cwd())
 */
export function writeProjectConfig(config: ProjectConfig, dir?: string): void {
  const targetDir = dir || process.cwd()
  const argosDir = join(targetDir, '.argos')

  if (!existsSync(argosDir)) {
    mkdirSync(argosDir, { recursive: true })
  }

  const configPath = join(argosDir, 'project.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')

  // Create .gitignore with comment (but don't actually ignore anything)
  const gitignorePath = join(argosDir, '.gitignore')
  const gitignoreComment = '# argos 설정 (gitignore 하지 않음)\n'
  writeFileSync(gitignorePath, gitignoreComment, 'utf8')
}
