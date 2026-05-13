-- CreateEnum: ClaudePlan
-- 멤버가 사용 중인 Claude 요금제. 수동 입력 전용 (Anthropic 공개 API 미제공).
CREATE TYPE "ClaudePlan" AS ENUM ('FREE', 'PRO', 'MAX', 'TEAM', 'ENTERPRISE');

-- AlterTable: users
ALTER TABLE "users" ADD COLUMN "claude_plan" "ClaudePlan";
