-- CreateEnum: AgentSource
-- 세션을 생성한 코딩 에이전트(출처). 기존 세션은 CLAUDE 로 백필.
CREATE TYPE "AgentSource" AS ENUM ('CLAUDE', 'CODEX');

-- AlterTable: claude_sessions
ALTER TABLE "claude_sessions" ADD COLUMN "agent" "AgentSource" NOT NULL DEFAULT 'CLAUDE';
