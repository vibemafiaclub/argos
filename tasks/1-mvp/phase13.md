# Phase 13: Web UX Polish

## 사전 준비

아래 문서들을 반드시 읽어라:

- `docs/flow.md` — Flow 8 (에러 및 엣지 케이스, empty state 명세)

이전 phase 산출물을 반드시 확인하라:

- `packages/web/src/app/dashboard/[projectId]/page.tsx`
- `packages/web/src/app/dashboard/[projectId]/users/page.tsx`
- `packages/web/src/app/dashboard/[projectId]/skills/page.tsx`
- `packages/web/src/app/dashboard/[projectId]/agents/page.tsx`
- `packages/web/src/app/dashboard/[projectId]/sessions/page.tsx`
- `packages/web/src/app/dashboard/[projectId]/sessions/[sessionId]/page.tsx`
- `packages/web/src/components/layout/sidebar.tsx`
- `packages/web/src/components/layout/header.tsx`

## 작업 내용

기존 대시보드 페이지의 UX를 고도화한다. **새 페이지나 데이터 연동 추가 금지. 기존 코드 개선만.**

### 1. 로딩 상태 (Skeleton)

모든 데이터 로딩 중 상태에 shadcn `Skeleton` 적용:

- **Overview 페이지**: StatCard 4개 스켈레톤, Chart 스켈레톤 (높이 고정 박스)
- **Users 페이지**: 테이블 행 5개 스켈레톤
- **Skills/Agents 페이지**: 바 차트 스켈레톤 + 테이블 스켈레톤
- **Sessions 페이지**: 테이블 행 10개 스켈레톤

각 페이지에 `loading.tsx` 파일로 구현하거나, 컴포넌트 내 조건부 렌더링으로 구현.

### 2. Empty State

데이터가 0개일 때 안내 메시지 표시:

**대시보드 전체 (이벤트 없음)**:
```
아직 수집된 데이터가 없습니다.
팀원들이 argos를 설정하고 Claude Code를 사용하면 여기에 데이터가 표시됩니다.

[설정 방법 보기 →] (docs 링크)
```

**Skills 페이지 (skill 호출 없음)**:
```
아직 Skill 호출이 없습니다.
Claude Code에서 /skill-name을 실행하면 여기에 표시됩니다.
```

**Sessions 페이지**:
```
이 기간에 세션이 없습니다.
날짜 범위를 변경해보세요.
```

### 3. 에러 상태

API 호출 실패 시:
- 에러 카드: "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
- shadcn `Alert` (variant="destructive") 사용
- 재시도 버튼 (TanStack Query `refetch`)

### 4. 차트 개선

**TokenUsageChart**:
- 툴팁에 날짜, 입력 토큰, 출력 토큰, 예상 비용 표시
- X축 날짜 포맷 (Apr 14, Apr 15...)
- 반응형 (`ResponsiveContainer` with `width="100%" height={300}`)
- 컬러 팔레트: 브랜드 색상 (slate/blue 계열)

**SkillBarChart**:
- 툴팁에 skill 이름과 호출 수
- 수평 바 (가독성)
- 바 너비 제한으로 긴 skill 이름 truncation + 툴팁으로 전체 표시

### 5. 반응형 레이아웃

- 모바일(< 768px): 사이드바 → 상단 네비게이션 또는 햄버거 메뉴
- 테이블: 모바일에서 가로 스크롤 (`overflow-x-auto`)
- StatCard 그리드: 모바일 1열, 태블릿 2열, 데스크톱 4열

### 6. 날짜 범위 선택기 개선

현재 날짜 기준으로 실제 날짜 계산:
- "최근 7일" 버튼
- "최근 30일" 버튼 (기본)
- "최근 90일" 버튼
- 선택된 범위 시각적으로 강조

### 7. 세션 대화 뷰 개선 (`sessions/[sessionId]/page.tsx`)

- HUMAN 메시지: 배경색 구분 (gray-100)
- ASSISTANT 메시지: 배경색 구분 (blue-50)
- role 레이블 표시 (You / Claude)
- 타임스탬프 표시
- 긴 메시지 접기/펼치기 (500자 초과 시 "더 보기" 버튼)
- 코드 블록 인식: \`\`\` 패턴 → `<pre><code>` 렌더링 (마크다운 렌더러 사용 금지, 단순 regex로 처리)

### 8. 전반적인 폴리시

- 페이지 전환 시 부드러운 로딩 (Next.js 기본 동작 + skeleton)
- 숫자 포맷 일관성: `formatTokens`, `formatCost` 함수 모든 곳에서 사용
- 테이블 정렬: 기본적으로 최신/높은 값 내림차순
- 버튼과 링크의 hover 상태 명확히
- 색상: TailwindCSS 기본 팔레트, 과도한 커스텀 색상 사용 금지

## Acceptance Criteria

```bash
cd /Users/choesumin/Desktop/dev/vmc/argos
pnpm --filter @argos/web build
# 빌드 에러 없음, TypeScript 에러 없음
```

## AC 검증 방법

빌드 성공 시 `/tasks/1-mvp/index.json`의 phase 13 status를 `"completed"`로 변경하라.
3회 이상 실패 시 `"error"`로, 에러 내용 기록.

## 주의사항

- 이 phase는 **기존 코드 개선**이 목적이다. 새 API 엔드포인트 연동, 새 페이지 추가 금지.
- Skeleton의 크기는 실제 콘텐츠와 유사하게 설정하라 (너무 작거나 크면 layout shift가 심하다).
- 코드 블록 렌더링에 외부 마크다운 라이브러리(remark, react-markdown 등)를 설치하지 마라. 단순 정규식으로 처리하거나, 그냥 일반 텍스트로 렌더링해도 된다.
- 반응형 사이드바 구현이 복잡하면 단순히 모바일에서 감추고 상단에 네비게이션 탭만 추가하는 것으로 충분하다.
