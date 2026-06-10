-- CreateEnum
CREATE TYPE "TokenSource" AS ENUM ('CLI', 'WEB', 'IMPERSONATION');

-- AlterTable
ALTER TABLE "cli_tokens" ADD COLUMN "source" "TokenSource" NOT NULL DEFAULT 'CLI';
