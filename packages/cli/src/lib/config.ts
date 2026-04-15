import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'

export interface Config {
  token: string
  apiUrl: string
  userId: string
  email: string
}

export function getConfigPath(): string {
  return join(homedir(), '.argos', 'config.json')
}

export function readConfig(): Config | null {
  try {
    const configPath = getConfigPath()
    if (!existsSync(configPath)) {
      return null
    }
    const content = readFileSync(configPath, 'utf8')
    return JSON.parse(content) as Config
  } catch {
    return null
  }
}

export function writeConfig(config: Config): void {
  const configPath = getConfigPath()
  const configDir = join(homedir(), '.argos')

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
}

export function deleteConfig(): void {
  try {
    const configPath = getConfigPath()
    if (existsSync(configPath)) {
      unlinkSync(configPath)
    }
  } catch {
    // Ignore errors
  }
}

export function requireAuth(): Config {
  const config = readConfig()
  if (!config) {
    console.error('✗ 로그인이 필요합니다.')
    console.error('  argos를 실행하여 로그인하세요.')
    process.exit(1)
  }
  return config
}
