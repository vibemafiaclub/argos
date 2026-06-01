import { existsSync } from 'fs'
import { input } from '@inquirer/prompts'
import { readConfig, writeConfig, deleteConfig } from './lib/config.js'
import { findProjectConfig, writeProjectConfig } from './lib/project.js'
import { runLoginFlow } from './lib/auth-flow.js'
import { apiRequest } from './lib/api-client.js'
import { injectHooks } from './lib/hooks-inject.js'
import { sendEventBackground } from './lib/event-sender.js'
import { extractUsageFromTranscript, extractUsagePerTurn, detectSlashCommand, extractMessages, extractSummary } from './lib/transcript.js'
import type { ExternalDeps } from './deps.js'
import type { CreateProjectResponse, ExchangeResponse } from '@argos/shared'

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
    async exchange(onboardToken: string, apiUrl: string): Promise<ExchangeResponse> {
      return apiRequest<ExchangeResponse>(`${apiUrl}/api/auth/exchange`, {
        method: 'POST',
        body: JSON.stringify({ onboardToken }),
        baseUrl: '',
      })
    },
    async createProject(name: string, token: string, apiUrl: string): Promise<CreateProjectResponse> {
      const orgsRes = await apiRequest<{ orgs: Array<{ id: string; name: string; slug: string; role: string }> }>(
        `${apiUrl}/api/orgs`,
        { method: 'GET', token, baseUrl: '' }
      )

      let org: { id: string; name: string; slug: string }
      if (!orgsRes.orgs || orgsRes.orgs.length === 0) {
        // 신규 유저: 첫 번째 프로젝트 생성 시 org를 프로젝트명과 동일하게 자동 생성
        const createOrgRes = await apiRequest<{ org: { id: string; name: string; slug: string } }>(
          `${apiUrl}/api/orgs`,
          {
            method: 'POST',
            body: JSON.stringify({ name }),
            token,
            baseUrl: '',
          }
        )
        org = createOrgRes.org
      } else {
        org = orgsRes.orgs[0]
      }

      const createRes = await apiRequest<{
        project: { id: string; orgId: string; slug: string; name: string }
      }>(`${apiUrl}/api/orgs/${org.slug}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name }),
        token,
        baseUrl: '',
      })

      return {
        projectId: createRes.project.id,
        orgId: createRes.project.orgId,
        orgSlug: org.slug,
        orgName: org.name,
        projectName: createRes.project.name,
        projectSlug: createRes.project.slug,
      }
    },
    async joinOrg(orgSlug: string, token: string, apiUrl: string): Promise<void> {
      await apiRequest(`${apiUrl}/api/orgs/${orgSlug}/members`, {
        method: 'POST',
        token,
        baseUrl: '',
      })
    },
    async ensureMembership(orgSlug: string, token: string, apiUrl: string): Promise<void> {
      await apiRequest(`${apiUrl}/api/orgs/${orgSlug}/members`, {
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
    extractSummary: extractSummary,
  },
  events: {
    sendBackground: sendEventBackground,
  },
  cwd(): string {
    return process.cwd()
  },
}
