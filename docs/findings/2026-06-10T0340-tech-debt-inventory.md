---
title: 기술 부채 인벤토리 — 배포 파이프라인, 의존성, 문서 드리프트, 정리 대상
created_at: 2026-06-10T03:40:00Z
resolved: false
priority: P1
related:
  - docs/findings/2026-06-10T0340-quality-gate-gaps.md
  - docs/findings/2026-06-10T0340-architecture-unintuitive.md
---

# 기술 부채 인벤토리 — 배포 파이프라인, 의존성, 문서 드리프트, 정리 대상

## TL;DR

배포·의존성·설정·문서 전반의 부채 목록. P1은 빌드 단계의 migrate 실행,
next-auth 베타 의존, shadcn CLI의 프로덕션 의존성 유입 3건. 나머지는
방치 시 드리프트가 누적되는 P2 정리 항목. (CI 테스트 공백은
docs/findings/2026-06-10T0340-quality-gate-gaps.md가, 인증 구조는
architecture 문서가 소유 — 여기 중복 수록하지 않음.)

## Body

### P1

**D1 — 프로덕션 빌드 단계에서 `prisma migrate deploy` 실행.**
`vercel.json:4` — buildCommand 안에서 `VERCEL_ENV=production`일 때
`db:migrate` 후 build. 마이그레이션 성공 후 빌드가 실패하면 "구 코드 +
신 스키마" 상태가 남고, preview 배포는 마이그레이션을 건너뛰어 preview
스키마가 드리프트한다. → 마이그레이션을 배포 파이프라인의 별도 스텝으로
분리하고 breaking 변경은 expand-contract 강제.

**D2 — `next-auth@5.0.0-beta.30` 프로덕션 사용.**
`packages/web/package.json:30` `"next-auth": "^5.0.0-beta"`,
`pnpm-lock.yaml:3385`. 베타 범위(`^…-beta`)는 breaking change가 들어올 수
있다. → 정확 버전 고정 후 GA 전환 계획.

**D3 — `shadcn` CLI가 dependencies에 포함, MCP SDK·hono까지 프로덕션
의존성으로 유입.** `packages/web/package.json:38` — src 내 import 0건인데
`shadcn@4.10.0 → @modelcontextprotocol/sdk → hono` 체인이 형성되고,
`pnpm-workspace.yaml`의 hono 보안 override도 이 체인 때문에 존재.
→ devDependencies로 이동(또는 `pnpm dlx`), override 필요성 재검토.

### P2 — 드리프트 소스

**D4 — zod 스키마와 TS 인터페이스의 수동 이중 정의.**
`packages/shared/src/schemas/events.ts:29-46`(IngestEventSchema)와
`packages/shared/src/types/events.ts:43-62`(IngestEventPayload)가 같은
필드를 손으로 두 번 정의(현재는 일치). → `z.infer`로 타입을 스키마에서
파생해 드리프트를 컴파일러가 잡게 한다.

**D5 — docs가 존재하지 않는 `packages/api`(Hono) 아키텍처를 기술.**
`docs/code-architecture.md:25,142,157,245-255,718-719` — Hono/Railway/
Dockerfile까지 기술하나 실제 패키지는 cli/shared/web뿐.
`docs/data-schema.md:32`도 `packages/api/prisma/schema.prisma`를 가리키고
`:60-77`의 User 모델 스냅샷에는 `claudePlan`, `projectMembers` 등 이후
모델·snake_case 매핑이 전부 누락. `packages/web/.env.example:3` 주석이
흡수 사실을 자인. → code-architecture.md를 현행 Next.js 토폴로지로
재작성, data-schema.md는 schema.prisma 링크 + ERD 요약만 유지.

**D6 — 만료 토큰/인증요청 행이 영구 누적.**
`packages/web/src/app/api/auth/cli-request/route.ts:13-15` — 시도마다
`cliAuthRequest.create`(15분 만료)하지만 web src 전체에
`cliAuthRequest`/`onboardToken`/`passwordResetToken` `deleteMany` 0건,
vercel.json에 cron 없음. 만료된 시크릿 해시가 DB에 영구 잔존.
→ Vercel cron으로 `expiresAt < now()` 주기 삭제.

**D7 — turbo.json env 드리프트.**
`turbo.json:9-10` — 사용처 0건인 `AUTH_GITHUB_ID/SECRET` 선언. 반면
`packages/web/src/app/layout.tsx:8`이 쓰는 `NEXT_PUBLIC_SITE_URL`은 turbo
env 목록·`.env.example` 모두 누락 — turbo 캐시가 env 변경을 감지 못해
stale 빌드 재사용 가능. → 죽은 키 제거, 누락 키 추가.

**D8 — `vercel.json` 동일 내용 2벌.**
루트와 `packages/web/`에 byte 단위 동일 파일. 둘 다 `cd ../..` 등
packages/web 기준 상대경로라 루트 해석 시 저장소 밖으로 나간다. Vercel
Root Directory 설정에 따라 한쪽만 읽혀 조용한 드리프트 발생.
→ 실제 읽히는 1벌만 남기고 삭제.

**D9 — deprecated `aggregateSummary(rollups, number)` 오버로드를 내부가
여전히 사용.** `packages/web/src/lib/server/daily-rollup.ts:582`
@deprecated 선언 vs `weekly-report.ts:383-384` `aggregateSummary(..., 10)`
호출. → 호출부를 options 객체로 바꾸고 오버로드 제거.

**D10 — `eslint-config-next@16.2.3` vs `next@15.5.18` 메이저 불일치.**
`packages/web/package.json:29,50`. Next 16 규칙이 15 앱에 적용돼 거짓
양성/누락 가능. → 버전 정렬(16 업그레이드 계획 또는 15.x로 다운).

**D11 — git 위생.** `.gitignore:14`의 `persuasion-data/runs/` 규칙에도
불구하고 규칙 추가 전 커밋된 26개 파일이 추적 중(`git ls-files` 확인).
hook 검증 스크래치 `cc-test/`(hook-events.jsonl 등)도 커밋돼 있음.
→ `git rm -r --cached persuasion-data/runs`, cc-test 삭제 또는 ignore.

**D12 — 잡다한 매니페스트 정리.**
- `packages/cli/package.json:34-35` `engines: node >=18`(EOL) vs
  `@types/node ^20` — `>=20`으로 상향.
- `packages/web/package.json:23,45` `bcryptjs ^2` + `@types/bcryptjs` —
  3.x는 타입 내장, 2.x는 유지보수 중단. 업그레이드 후 @types 제거.
- `packages/web/package.json:5` `packageManager` 필드가 루트와 중복 선언
  (web에만 있음) — 삭제.

## Acceptance signal

- D1: vercel buildCommand에 `db:migrate` 미포함 + 별도 배포 스텝 문서/설정
  존재.
- D3: `pnpm why shadcn` 결과 devDependencies 경로만 표시.
- D4: `packages/shared/src/types/events.ts`의 payload 타입이 `z.infer`
  파생으로 대체.
- D5: `grep -c "packages/api" docs/code-architecture.md` → 0.
- D11: `git ls-files persuasion-data/runs | wc -l` → 0.
