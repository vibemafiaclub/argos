# 배포에서 DB 마이그레이션 분리

## 현황

`vercel.json`의 `buildCommand`에서 `prisma migrate deploy`가 제거되었다.
빌드 단계에서 마이그레이션을 실행하면 "빌드 실패 + 스키마는 이미 변경된"
상태가 발생할 수 있고, preview 배포가 마이그레이션을 건너뛰어 스키마 드리프트가 생긴다.

## 권장 분리 방법

### 옵션 A — GitHub Actions pre-deploy job (권장)

```yaml
jobs:
  migrate:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @argos/web exec prisma migrate deploy
        env:
          DIRECT_URL: ${{ secrets.DATABASE_DIRECT_URL }}

  deploy:
    needs: migrate
    ...
```

이 방식은 마이그레이션이 성공한 경우에만 배포가 진행된다.

### 옵션 B — Vercel deploymentUrl 훅

Vercel `deployHooks`로 별도 서버리스 함수를 트리거해 마이그레이션을 실행한다.
구성이 복잡하고 DIRECT_URL 관리가 어려워 옵션 A를 권장한다.

## Breaking change 원칙

스키마 변경은 **expand-contract** 패턴을 따른다:
1. **Expand**: nullable 컬럼 추가 또는 새 테이블 추가 — 기존 코드와 호환
2. **Migrate**: 코드 배포 후 데이터 백필
3. **Contract**: 더 이상 필요 없는 구 컬럼 제거

이를 통해 "구 코드 + 신 스키마" 또는 "신 코드 + 구 스키마" 상태를 방지한다.
