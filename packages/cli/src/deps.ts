import type { Config } from './lib/config.js'
import type { ProjectConfig } from './lib/project.js'
import type { LoginResponse, CreateProjectResponse, IngestEventPayload, UsagePayload, MessagePayload } from '@argos/shared'

export interface ExternalDeps {
  config: {
    read(): Config | null
    write(config: Config): void
    delete(): void
  }
  project: {
    find(cwd?: string): ProjectConfig | null
    write(config: ProjectConfig): void
  }
  auth: {
    login(apiUrl: string): Promise<LoginResponse>
  }
  api: {
    createProject(name: string, token: string, apiUrl: string): Promise<CreateProjectResponse>
    joinOrg(orgId: string, token: string, apiUrl: string): Promise<void>
    ensureMembership(orgId: string, token: string, apiUrl: string): Promise<void>
    revokeToken(token: string, apiUrl: string): Promise<void>
  }
  hooks: {
    inject(settingsPath: string): 'injected' | 'already_present'
    fileExists(path: string): boolean
  }
  prompt: {
    input(message: string, defaultValue?: string): Promise<string>
  }
  transcript: {
    extractUsage(path: string): Promise<UsagePayload | null>
    detectSlashCommand(path: string): Promise<string | null>
    extractMessages(path: string): Promise<MessagePayload[]>
  }
  events: {
    sendBackground(url: string, token: string, payload: IngestEventPayload): void
  }
  cwd(): string
}

export type CommandFactory<TOpts = Record<string, unknown>> =
  (deps: ExternalDeps) => (opts: TOpts) => Promise<void>
