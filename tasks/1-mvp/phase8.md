# Phase 8: API Dashboard Eval

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/data-schema.md` — 5번 섹션 (핵심 쿼리 패턴, 기준)
- `packages/shared/src/types/dashboard.ts` — 응답 타입 (정확히 일치해야 함)

이전 phase 산출물을 반드시 확인하라:

- `packages/api/src/routes/dashboard.ts`
- `packages/api/src/lib/dashboard.ts`

## 작업 내용

Phase 7 산출물을 검토하고 수정한다. **새 기능 추가 금지.**

### 검토 체크리스트

#### 보안
- [ ] 모든 6개 라우트에 org 멤버십 확인 존재
- [ ] `projectId`가 실제 org에 속하는지 확인 (엉뚱한 projectId 요청 시 403)
- [ ] `$queryRaw`에서 Prisma tagged template 사용 (SQL injection 방지)

#### 응답 스키마 정확성
- [ ] `summary` 응답이 `DashboardSummary` 타입과 일치 (null 없이 숫자 필드는 0으로 fallback)
- [ ] `usage` 응답이 `UsageSeries[]` 타입과 일치 (`date: string` YYYY-MM-DD)
- [ ] `users` 응답이 `UserStat[]` 타입과 일치
- [ ] `skills` 응답이 `SkillStat[]` 타입과 일치 (`slashCommandCount`, `lastUsedAt` 포함)
- [ ] `agents` 응답이 `AgentStat[]` 타입과 일치 (`sampleDesc` 포함)
- [ ] `sessions` 응답이 `SessionItem[]` 타입과 일치 (`eventCount` 포함)

#### 쿼리 품질
- [ ] `summary` 라우트가 `Promise.all`로 병렬 쿼리 실행
- [ ] `users` 라우트에 N+1 없음 (단일 쿼리 또는 `Promise.all`)
- [ ] `skills` 라우트 `slashCommandCount`가 추가 쿼리 없이 효율적으로 가져와짐
- [ ] 날짜 범위 기본값 (최근 30일)이 올바르게 설정됨
- [ ] `parseDateRange()`가 from > to 같은 잘못된 입력을 처리함

#### 코드 품질
- [ ] `dashboard.ts` lib에 순수 헬퍼만 있음 (라우트 로직 없음)
- [ ] 쿼리 결과의 BigInt 처리 (Prisma `$queryRaw`는 BigInt 반환 — JSON 직렬화 시 에러)
- [ ] null 합계 값이 `?? 0` fallback

### 발견된 문제 수정

`$queryRaw` 결과의 BigInt → Number 변환은 흔한 버그다. 반드시 확인하고 수정하라:
```typescript
// BigInt를 Number로 변환하는 방법
Number(bigIntValue)
// 또는 JSON.stringify replacer 사용
```

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter @argos/api build
# 컴파일 에러 없음
```

## AC 검증 방법

빌드 성공 시 `/tasks/1-mvp/index.json`의 phase 8 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- BigInt JSON 직렬화 오류는 런타임에만 발생한다. 빌드 성공해도 실제로 발생할 수 있다. `$queryRaw` 결과의 모든 필드를 Number()로 변환하라.
- `DATE_TRUNC` 결과가 `Date` 객체로 오면 `.toISOString().slice(0, 10)`로 YYYY-MM-DD 변환하라.
