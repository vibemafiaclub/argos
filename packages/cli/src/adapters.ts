import { existsSync } from 'fs'
import { input } from '@inquirer/prompts'
import { readConfig, writeConfig, deleteConfig } from './lib/config.js'
import { findProjectConfig, writeProjectConfig } from './lib/project.js'
import { runLoginFlow } from './lib/auth-flow.js'
import { apiRequest } from './lib/api-client.js'
import { injectHooks } from './lib/hooks-inject.js'
import { sendEventBackground } from './lib/event-sender.js'
import { extractUsageFromTranscript, extractUsagePerTurn, detectSlashCommand, extractMessages } from './lib/transcript.js'
import type { ExternalDeps } from './deps.js'
import type { CreateProjectResponse } from '@argos/shared'

export const realDeps: ExternalDeps = {
  config: {
    read: readConfig,
    write: writeConfig,
    delete: deleteConfig,
  },
  project: {
    find: findProjectConfig,
    write: writeProjectConfig,
  },
  auth: {
    login: runLoginFlow,
  },
  api: {
    async createProject(name: string, token: string, apiUrl: string): Promise<CreateProjectResponse> {
      return apiRequest<CreateProjectResponse>(`${apiUrl}/api/projects`, {
        method: 'POST',
        body: JSON.stringify({ name }),
        token,
        baseUrl: '',
      })
    },
    async joinOrg(orgId: string, token: string, apiUrl: string): Promise<void> {
      await apiRequest(`${apiUrl}/api/orgs/${orgId}/members`, {
        method: 'POST',
        token,
        baseUrl: '',
      })
    },
    async ensureMembership(orgId: string, token: string, apiUrl: string): Promise<void> {
      await apiRequest(`${apiUrl}/api/orgs/${orgId}/members`, {
        method: 'POST',
        token,
        baseUrl: '',
      })
    },
    async revokeToken(token: string, apiUrl: string): Promise<void> {
      await apiRequest(`${apiUrl}/api/auth/logout`, {
        method: 'POST',
        token,
        baseUrl: '',
      })
    },
  },
  hooks: {
    inject: injectHooks,
    fileExists: existsSync,
  },
  prompt: {
    async input(message: string, defaultValue?: string): Promise<string> {
      return input({ message, default: defaultValue })
    },
  },
  transcript: {
    extractUsage: extractUsageFromTranscript,
    extractUsagePerTurn: extractUsagePerTurn,
    detectSlashCommand: detectSlashCommand,
    extractMessages: extractMessages,
  },
  events: {
    sendBackground: sendEventBackground,
  },
  cwd(): string {
    return process.cwd()
  },
}
