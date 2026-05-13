-- CreateTable: project_members
-- 프로젝트별 접근 제어 테이블.
-- OWNER/MANAGER는 org 역할로 우회; MEMBER/VIEWER는 여기 등록된 경우에만 접근 가능.
CREATE TABLE "project_members" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: 기존 org 멤버를 모든 프로젝트에 추가 (기존 접근 권한 유지).
-- 이후 MANAGER가 설정 페이지에서 특정 멤버의 프로젝트 접근을 제거할 수 있음.
INSERT INTO "project_members" ("project_id", "user_id", "created_at")
SELECT p.id, om.user_id, NOW()
FROM "projects" p
JOIN "org_memberships" om ON om.org_id = p.org_id
ON CONFLICT DO NOTHING;
