import type { Config } from './lib/config.js'
import type { ProjectConfig } from './lib/project.js'
import type { LoginResponse, ExchangeResponse, CreateProjectResponse, IngestEventPayload, UsagePayload, UsagePerTurnPayload, MessagePayload } from '@argos/shared'

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
    exchange(onboardToken: string, apiUrl: string): Promise<ExchangeResponse>
    createProject(name: string, token: string, apiUrl: string): Promise<CreateProjectResponse>
    joinOrg(orgSlug: string, token: string, apiUrl: string): Promise<void>
    ensureMembership(orgSlug: string, token: string, apiUrl: string): Promise<void>
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
    extractUsagePerTurn(path: string): Promise<UsagePerTurnPayload[]>
    detectSlashCommand(path: string): Promise<string | null>
    extractMessages(path: string): Promise<MessagePayload[]>
    extractSummary(path: string): Promise<string | null>
  }
  events: {
    sendBackground(url: string, token: string, payload: IngestEventPayload): void
  }
  cwd(): string
}

export type CommandFactory<TOpts = Record<string, unknown>> =
  (deps: ExternalDeps) => (opts: TOpts) => Promise<void>
