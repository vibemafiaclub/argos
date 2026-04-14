-- CreateTable
CREATE TABLE "cli_auth_requests" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "token" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "denied" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cli_auth_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cli_auth_requests_state_key" ON "cli_auth_requests"("state");
