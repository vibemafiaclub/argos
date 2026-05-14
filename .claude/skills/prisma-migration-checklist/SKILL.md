---
name: prisma-migration-checklist
description: Prisma 마이그레이션 파일이 포함된 커밋 완료 후 배포 체크리스트를 자동으로 출력한다
triggers:
  - prisma migrate
  - migration.sql
  - schema.prisma 변경
  - 마이그레이션
---

# Prisma 마이그레이션 배포 체크리스트

마이그레이션 파일이 커밋에 포함된 경우, 구현 완료 메시지 말미에 반드시 아래 체크리스트를 포함하라:

## 배포 체크리스트
- [ ] `prisma migrate deploy` 실행 (배포 환경에서 별도 수행 필요)
- [ ] 영향 받는 테이블: (변경된 테이블 명시)
- [ ] backfill 포함 여부: (포함/미포함 명시)
- [ ] 영향 받는 API 엔드포인트: (변경된 스키마를 사용하는 API 목록)
- [ ] 롤백 방법: `prisma migrate resolve --rolled-back <migration_name>`

기존 데이터에 영향을 주는 변경(컬럼 추가, 타입 변경, 삭제)이 있을 경우, 운영 중인 사용자에게 미치는 즉각적인 영향도 한 줄로 명시하라.