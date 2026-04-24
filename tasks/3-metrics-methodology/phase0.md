# Phase 0: docs 업데이트

## 배경 (이 phase만 보고 작업하는 독립 session용 컨텍스트)

이번 task는 Skills/Agents 대시보드에 **Active users(userCount)** + **대체 지표(medianDurationMs)** 컬럼을 추가하고, 모든 대시보드 지표의 공학적 정의를 드러내는 `/docs/metrics-methodology` 정적 페이지를 신설하는 작업이다. 원래 요구사항(`iterations/3-20260424_152703/requirement.md`)은 "success rate"를 대체 지표 후보로 명시했으나, **플래닝 단계에서 프로덕션 DB 사전 조사를 통해 다음이 확정되었다**:

- 프로덕션 `events` 테이블 2,279건 중 POST_TOOL_USE는 29건뿐이며, 전부 `mcp__claude_ai_Gmail__*` MCP 툴. Skill/Agent/Bash/Read/Edit 등 대부분 도구는 POST_TOOL_USE가 0건.
- 29건 전부 `exit_code = NULL`. 즉 Claude Code hook이 Skill/Agent 도구에 대해 PostToolUse/exit_code를 공급하지 않는다(Claude Code 측 제약).
- 따라서 requirement 원안의 `SUM(POST_TOOL_USE AND exit_code IN (NULL, 0)) / SUM(POST_TOOL_USE)` 기반 successRate 는 **원천적으로 수집 불가**.

CTO 가이드에 따라 successRate 대신 **medianDurationMs**(messages.duration_ms 중앙값)를 대체 지표로 채택한다. Skill은 `tool_input->>'skill'`, Agent는 `tool_input->>'subagent_type'`에서 JSON으로 이름을 추출한다.

**이 phase(Phase 0)는 코드 변경을 하지 않는다. 문서만 업데이트한다.** 구현은 Phase 1에서 한다.

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 아키텍처와 설계 의도를 이해하라:

- `/docs/spec.md` — 문서 인덱스
- `/docs/code-architecture.md` — 모노레포 구조, API/Web 경계, Hono→Next.js 라우트 흡수 이력
- `/docs/data-schema.md` — events·messages·usage_records·claude_sessions ERD 및 인덱스, 핵심 쿼리 패턴
- `/docs/mission.md` — 제품 미션, "Skill/Agent ROI" 핵심 가치
- `/docs/user-intervention.md` — 인간 개입 기록 포맷
- `/iterations/3-20260424_152703/requirement.md` — 원 요구사항 + CTO 조건부 조건

그리고 구현 대상이 될 현재 파일들도 훑어보라(이 phase에서 수정하지 않지만 문서가 이들을 지칭하게 되므로):

- `/packages/shared/src/types/dashboard.ts` — `SkillStat`, `AgentStat` 타입
- `/packages/web/src/app/api/orgs/[orgSlug]/dashboard/skills/route.ts`
- `/packages/web/src/app/api/orgs/[orgSlug]/dashboard/agents/route.ts`
- `/packages/web/src/app/dashboard/[orgSlug]/{skills,agents}/page.tsx`
- `/packages/web/prisma/schema.prisma` — Event, Message, ClaudeSession 모델

## 작업 내용

세 파일을 업데이트한다. **스키마 파일(schema.prisma)은 건드리지 않는다.** 이번 작업은 기존 컬럼만 조합한다.

### 1) `docs/data-schema.md` — 집계 쿼리 패턴 섹션 확장

`## 5. 핵심 쿼리 패턴` 섹션 안, 기존 "### Skill 호출 빈도" 바로 아래에 새 하위 섹션 추가:

#### 추가할 내용: `### Skills/Agents — userCount + medianDurationMs (methodology 페이지 참조)`

아래 요지를 한국어 설명 + SQL 스니펫으로 문서화:

- **userCount**: `events` 테이블에서 `is_skill_call=true`(또는 `is_agent_call=true`) + `skill_name`(또는 `agent_type`) 그룹별로 `COUNT(DISTINCT user_id)`. events 기준 집계 — messages 기준으로 혼용 금지(일관성 문제 방지).
- **medianDurationMs**: `messages` 테이블의 `role='TOOL' AND tool_name IN ('Skill','Agent') AND duration_ms IS NOT NULL` 행에 대해, `tool_input->>'skill'` 또는 `tool_input->>'subagent_type'`로 그룹화해 `percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)` 계산.
- **샘플 수 임계값**: duration 기록 행 수가 3 미만이면 medianDurationMs는 API에서 `null`로 반환(통계 유의미성이 아닌 "매우 빈약한 데이터 숨김" 휴리스틱).
- **messages의 project_id 필터링**: messages 테이블은 project_id 컬럼을 갖지 않는다. `claude_sessions s ON s.id = m.session_id` 로 join해 `s.project_id = ANY($projectIds)` 로 필터링한다.
- **timing 주의**: messages.durationMs는 Stop 이벤트에서 transcript 기반으로 재빌드되므로, 진행 중인 세션의 tool call은 집계에 포함되지 않을 수 있다. 세션 종료 후 반영된다.
- **successRate를 채택하지 않은 이유**: Claude Code hook이 Skill/Agent 도구에 대해 PostToolUse를 발사하지 않고 exit_code를 제공하지 않음을 2026-04-24 프로덕션 실측으로 확인(`packages/web/src/app/api/events/route.ts`의 수신 루트는 정상). 향후 Claude Code가 해당 페이로드를 제공하기 시작하면 재도입 검토.

대표 SQL을 하나 포함:

```sql
-- Skills 집계 (Agents도 동일 패턴, is_skill_call → is_agent_call, skill_name → agent_type)
WITH skill_events AS (
  SELECT
    skill_name,
    COUNT(*)                            AS call_count,
    COUNT(DISTINCT session_id)          AS session_count,
    COUNT(DISTINCT user_id)             AS user_count,
    MAX(timestamp)                      AS last_used_at
  FROM events
  WHERE project_id = ANY($1::text[])
    AND is_skill_call = true
    AND skill_name IS NOT NULL
    AND timestamp BETWEEN $2 AND $3
  GROUP BY skill_name
),
skill_durations AS (
  SELECT
    m.tool_input->>'skill'                                          AS skill_name,
    COUNT(m.duration_ms)                                            AS duration_sample_count,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY m.duration_ms)      AS median_duration_ms
  FROM messages m
  JOIN claude_sessions s ON s.id = m.session_id
  WHERE s.project_id = ANY($1::text[])
    AND m.role = 'TOOL'
    AND m.tool_name = 'Skill'
    AND m.duration_ms IS NOT NULL
    AND m.timestamp BETWEEN $2 AND $3
  GROUP BY m.tool_input->>'skill'
)
SELECT
  e.skill_name, e.call_count, e.session_count, e.user_count, e.last_used_at,
  CASE WHEN d.duration_sample_count >= 3 THEN d.median_duration_ms ELSE NULL END AS median_duration_ms
FROM skill_events e
LEFT JOIN skill_durations d USING (skill_name)
ORDER BY e.call_count DESC
LIMIT 50;
```

### 2) `docs/user-intervention.md` — Claude Code hook 제약 실측 기록 + 재도입 트리거

`(아직 기록 없음)` 자리에 새 섹션으로 대체. 형식은 파일 상단 템플릿 준수.

```
## 2026-04-24 — Skill/Agent successRate 도입 보류 (Claude Code hook 제약)

- **컨텍스트**: iteration 3 요구사항 `3-20260424_152703/requirement.md` 는 Skills/Agents 대시보드에 `successRate = (POST_TOOL_USE 중 exit_code IS NULL OR 0 비율)` 컬럼 추가를 제안했다. 사전 조사에서 프로덕션 `events` 2,279건 중 POST_TOOL_USE 29건, 전부 `mcp__claude_ai_Gmail__*` MCP 툴, `exit_code`는 29건 전부 NULL임을 확인. Claude Code hook API가 내장 도구(Skill/Agent/Bash/Read/Edit/...)에 대해 PostToolUse를 발사하지 않거나 exit_code를 제공하지 않는다. 수집측(`packages/cli/src/commands/hook.ts`, `packages/cli/src/lib/hooks-inject.ts`)은 정상 — matcher `""` 로 전 도구에 hook이 걸려 있고, `exit_code` 필드는 payload에 있으면 그대로 전달되는 구조.
- **수행 주체**: plan-and-build 하네스 + tech-critic-lead CTO 판정.
- **수행 내용**: successRate 컬럼 대신 `medianDurationMs`(messages.duration_ms 중앙값)를 Skills/Agents 대시보드 대체 지표로 채택. 채택 이유와 한계를 `/docs/metrics-methodology` 페이지에 문서화하고, Skills/Agents 페이지 컬럼 헤더 InfoTooltip에도 동일 내용을 노출.
- **다음에 자동화할 수 있는가**: 조건부 예. **재도입 트리거**: Claude Code release note 또는 실측으로 `POST_TOOL_USE` 이벤트가 Skill/Agent 도구에 대해 쌓이기 시작하고 `exit_code` 필드가 채워지기 시작하면 재검토. 재측 쿼리 예시: `SELECT COUNT(*) FROM events WHERE event_type='POST_TOOL_USE' AND is_skill_call=true AND exit_code IS NOT NULL;` 결과가 0이 아닌 시점에 동일 티켓을 재오픈.
```

### 3) `docs/spec.md` — 대시보드 계약 포인터 추가 (최소 변경)

기존 `## 계약의 원천` 섹션 하단에 1줄 추가:

```
- 대시보드 지표의 공학적 정의: `packages/web/src/app/docs/metrics-methodology/page.tsx` 가 단일 진실 원천. tooltip·티켓 설명과의 drift 방지용.
```

**주의**: 이 시점에 `metrics-methodology/page.tsx`는 아직 존재하지 않는다. Phase 1에서 생성된다. 문서가 이를 선언적으로 가리키는 것은 의도된 배치다(Phase 0 완료 시 문서와 코드가 잠깐 어긋나지만 Phase 1에서 해소됨).

## Acceptance Criteria

```bash
# 1. 변경된 문서가 존재하고 요구된 내용이 들어있는지 확인
grep -q "Skills/Agents — userCount" docs/data-schema.md
grep -q "medianDurationMs" docs/data-schema.md
grep -q "successRate 도입 보류" docs/user-intervention.md
grep -q "metrics-methodology" docs/spec.md

# 2. 기존 테스트가 깨지지 않음 — Phase 0는 코드 변경 없음
cd packages/web && pnpm typecheck
cd packages/web && pnpm test
cd packages/shared && pnpm typecheck 2>/dev/null || true  # shared는 typecheck script 없으면 skip
```

## AC 검증 방법

위 AC 커맨드를 프로젝트 루트에서 실행한다. 모두 통과하면 `/tasks/3-metrics-methodology/index.json`의 phase 0 status를 `"completed"`로 변경한다. 3회 이상 실패하면 `"error"`로 변경하고 `error_message` 필드에 사유를 기록한다.

## 주의사항

- **코드 변경 금지**: 이 phase는 docs 3개 파일 수정만 한다. `packages/` 하위는 절대 건드리지 않는다. prisma/schema.prisma 포함.
- **사전 조사 결과를 임의로 각색하지 마라**: 실측치(POST_TOOL_USE 29건, 전부 MCP Gmail, exit_code 전건 NULL)는 플래닝 세션에서 확인된 값이다. 수치를 다시 추측하거나 변경하지 말 것.
- **data-schema.md 기존 섹션(1~4번 "설계 의도", "인덱스 전략")은 수정하지 않는다**. 추가만 한다.
- **user-intervention.md 템플릿 준수**: 파일 상단에 명시된 4필드(컨텍스트/수행 주체/수행 내용/자동화 가능성) 포맷을 지켜라.
- **문서에 "실패"/"에러" 같은 부정적 단어로 successRate를 묘사하지 마라**. "Claude Code hook 제약으로 현 시점 수집 불가 → 대체 지표 채택"이라는 **사실-기반 톤**으로 작성.
- **spec.md는 1줄만 추가**. 구조/인덱스/포맷 절대 변경 금지.
