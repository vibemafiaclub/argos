export type ClaudePlan = 'FREE' | 'PRO' | 'MAX' | 'TEAM' | 'ENTERPRISE'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  claudePlan?: ClaudePlan | null
  createdAt: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface OnboardTokenResponse {
  onboardToken: string
  expiresAt: string
}

export interface ExchangeRequest {
  onboardToken: string
}

export interface ExchangeResponse {
  token: string
  user: User
}

export type OrgRole = 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER'

export interface OrgMembership {
  id: string
  userId: string
  orgId: string
  role: OrgRole
}
