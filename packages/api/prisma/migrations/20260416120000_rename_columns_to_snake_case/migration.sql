-- Rename all camelCase columns to snake_case

-- organizations
ALTER TABLE "organizations" RENAME COLUMN "githubOrg" TO "github_org";
ALTER TABLE "organizations" RENAME COLUMN "avatarUrl" TO "avatar_url";
ALTER TABLE "organizations" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "organizations" RENAME COLUMN "updatedAt" TO "updated_at";

-- users
ALTER TABLE "users" RENAME COLUMN "passwordHash" TO "password_hash";
ALTER TABLE "users" RENAME COLUMN "avatarUrl" TO "avatar_url";
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "users" RENAME COLUMN "updatedAt" TO "updated_at";

-- org_memberships
ALTER TABLE "org_memberships" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "org_memberships" RENAME COLUMN "orgId" TO "org_id";
ALTER TABLE "org_memberships" RENAME COLUMN "createdAt" TO "created_at";

-- cli_auth_requests
ALTER TABLE "cli_auth_requests" RENAME COLUMN "expiresAt" TO "expires_at";
ALTER TABLE "cli_auth_requests" RENAME COLUMN "createdAt" TO "created_at";

-- cli_tokens
ALTER TABLE "cli_tokens" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "cli_tokens" RENAME COLUMN "tokenHash" TO "token_hash";
ALTER TABLE "cli_tokens" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "cli_tokens" RENAME COLUMN "lastUsedAt" TO "last_used_at";
ALTER TABLE "cli_tokens" RENAME COLUMN "revokedAt" TO "revoked_at";

-- projects
ALTER TABLE "projects" RENAME COLUMN "orgId" TO "org_id";
ALTER TABLE "projects" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "projects" RENAME COLUMN "updatedAt" TO "updated_at";

-- claude_sessions
ALTER TABLE "claude_sessions" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "claude_sessions" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "claude_sessions" RENAME COLUMN "transcriptPath" TO "transcript_path";
ALTER TABLE "claude_sessions" RENAME COLUMN "startedAt" TO "started_at";
ALTER TABLE "claude_sessions" RENAME COLUMN "endedAt" TO "ended_at";

-- events
ALTER TABLE "events" RENAME COLUMN "sessionId" TO "session_id";
ALTER TABLE "events" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "events" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "events" RENAME COLUMN "eventType" TO "event_type";
ALTER TABLE "events" RENAME COLUMN "toolName" TO "tool_name";
ALTER TABLE "events" RENAME COLUMN "toolInput" TO "tool_input";
ALTER TABLE "events" RENAME COLUMN "toolResponse" TO "tool_response";
ALTER TABLE "events" RENAME COLUMN "exitCode" TO "exit_code";
ALTER TABLE "events" RENAME COLUMN "isSkillCall" TO "is_skill_call";
ALTER TABLE "events" RENAME COLUMN "skillName" TO "skill_name";
ALTER TABLE "events" RENAME COLUMN "isSlashCommand" TO "is_slash_command";
ALTER TABLE "events" RENAME COLUMN "isAgentCall" TO "is_agent_call";
ALTER TABLE "events" RENAME COLUMN "agentType" TO "agent_type";
ALTER TABLE "events" RENAME COLUMN "agentDesc" TO "agent_desc";
ALTER TABLE "events" RENAME COLUMN "agentId" TO "agent_id";

-- usage_records
ALTER TABLE "usage_records" RENAME COLUMN "sessionId" TO "session_id";
ALTER TABLE "usage_records" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "usage_records" RENAME COLUMN "projectId" TO "project_id";
ALTER TABLE "usage_records" RENAME COLUMN "inputTokens" TO "input_tokens";
ALTER TABLE "usage_records" RENAME COLUMN "outputTokens" TO "output_tokens";
ALTER TABLE "usage_records" RENAME COLUMN "cacheCreationTokens" TO "cache_creation_tokens";
ALTER TABLE "usage_records" RENAME COLUMN "cacheReadTokens" TO "cache_read_tokens";
ALTER TABLE "usage_records" RENAME COLUMN "estimatedCostUsd" TO "estimated_cost_usd";
ALTER TABLE "usage_records" RENAME COLUMN "isSubagent" TO "is_subagent";

-- messages
ALTER TABLE "messages" RENAME COLUMN "sessionId" TO "session_id";
