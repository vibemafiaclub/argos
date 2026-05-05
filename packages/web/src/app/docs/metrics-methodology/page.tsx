export default function MetricsMethodologyPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <h1>Argos 지표 방법론 (Metrics Methodology)</h1>

      <p>
        이 페이지는 Argos 대시보드에 표시되는 모든 숫자의 공학적 정의를 단일 원천으로 공개합니다.
        결과가 기대와 다를 때 먼저 아래 정의를 확인하고, 여전히 의문이 있으면{' '}
        <a href="mailto:support@argos-ai.xyz">support@argos-ai.xyz</a>로 연락해 주세요.
      </p>

      <hr />

      <h2>지표별 정의</h2>

      <h3>callCount — 호출 수</h3>
      <p>
        집계 기간 내 해당 skill 또는 agent가 호출된 이벤트 수.
        <code>events</code> 테이블에서 <code>is_skill_call = true</code> (또는{' '}
        <code>is_agent_call = true</code>) 이고{' '}
        <code>skill_name IS NOT NULL</code> (또는 <code>agent_type IS NOT NULL</code>)인 행을
        그룹별로 COUNT한 값입니다. Agent 호출은 Claude Code의 <code>Agent</code> 또는{' '}
        <code>Task</code> tool 중 <code>tool_input.subagent_type</code>이 있는 호출입니다.
      </p>
      <pre className="text-xs overflow-x-auto">
        <code>{`SELECT skill_name, COUNT(*) AS call_count
FROM events
WHERE is_skill_call = true
  AND project_id = ANY($projectIds)
  AND timestamp BETWEEN $from AND $to
GROUP BY skill_name`}</code>
      </pre>

      <h3>sessionCount — 세션 수</h3>
      <p>
        해당 skill 또는 agent가 호출된 Claude Code 세션의 수.{' '}
        <code>COUNT(DISTINCT session_id)</code> 로 집계합니다.
        한 세션에서 같은 skill을 여러 번 호출해도 sessionCount는 1 증가합니다.
      </p>

      <h3>userCount — distinct user 수</h3>
      <p>
        집계 기간 내 해당 skill 또는 agent를 한 번이라도 호출한 unique 사용자 수.{' '}
        <strong>반드시 <code>events</code> 테이블에서 <code>COUNT(DISTINCT user_id)</code>로 집계합니다.</strong>{' '}
        messages 테이블 기준으로 집계하면 같은 호출을 다르게 카운팅할 수 있어 일관성 문제가 발생합니다.
      </p>
      <pre className="text-xs overflow-x-auto">
        <code>{`SELECT skill_name, COUNT(DISTINCT user_id) AS user_count
FROM events
WHERE is_skill_call = true
  AND project_id = ANY($projectIds)
  AND timestamp BETWEEN $from AND $to
GROUP BY skill_name`}</code>
      </pre>

      <h3>medianDurationMs — tool 완료 시간 중앙값</h3>
      <p>
        해당 skill 또는 agent의 단일 tool 실행 완료 시간 중앙값(ms).{' '}
        <code>messages</code> 테이블의 <code>duration_ms</code> 컬럼(p50)을 사용합니다.
        p95·p99가 아닌 p50을 사용하는 이유는 샘플 수가 작고 이상치 민감도를 낮추기 위함입니다.
      </p>
      <p>
        <strong>샘플 임계값: 3건.</strong>{' '}
        <code>duration_ms</code> 기록이 3건 미만이면 <code>null</code>을 반환하고 UI에서{' '}
        <code>—</code>(대시)로 표시합니다.
        이 임계값은 &ldquo;매우 빈약한 데이터 숨김&rdquo; 휴리스틱이며 통계적 유의수준(예: 30건)과 다릅니다.
        의도적으로 낮게 설정한 값입니다.
      </p>
      <p>
        <strong>세션 종료 후 반영:</strong>{' '}
        <code>messages.duration_ms</code>는 세션 종료(Stop 이벤트) 시 transcript를 기반으로
        재빌드되므로, 진행 중인 세션의 tool call은 집계에 포함되지 않을 수 있습니다.
        세션이 종료된 후에 이 값이 반영됩니다.
      </p>
      <pre className="text-xs overflow-x-auto">
        <code>{`WITH skill_durations AS (
  SELECT
    m.tool_input->>'skill'                                       AS skill_name,
    COUNT(m.duration_ms)                                         AS duration_sample_count,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY m.duration_ms)  AS median_duration_ms
  FROM messages m
  JOIN claude_sessions s ON s.id = m.session_id
  WHERE m.tool_name = 'Skill'
    AND s.project_id = ANY($projectIds)
    AND m.role = 'TOOL'
    AND m.duration_ms IS NOT NULL
    AND m.timestamp BETWEEN $from AND $to
  GROUP BY m.tool_input->>'skill'
)
-- 매핑 단계에서: duration_sample_count < 3 → medianDurationMs = null`}</code>
      </pre>
      <p>
        Agent duration도 같은 방식으로 계산하되, sub agent 호출이 <code>Task</code> tool로
        기록되는 Claude Code transcript를 포함하기 위해{' '}
        <code>m.tool_name IN (&apos;Agent&apos;, &apos;Task&apos;)</code>와{' '}
        <code>m.tool_input-&gt;&gt;&apos;subagent_type&apos;</code>을 사용합니다.
      </p>

      <h3>토큰 지표 (inputTokens / outputTokens / cacheReadTokens / cacheCreationTokens)</h3>
      <p>
        <code>usage_records</code> 테이블에서 집계합니다.
        각 <code>STOP</code> 또는 <code>SUBAGENT_STOP</code> 이벤트 시 transcript에서 추출한
        토큰 사용량이 <code>usage_records</code>에 기록됩니다.
        캐시 관련 토큰(<code>cacheReadTokens</code>, <code>cacheCreationTokens</code>)은
        Anthropic API 응답에서 직접 파싱합니다.
      </p>
      <pre className="text-xs overflow-x-auto">
        <code>{`SELECT
  SUM(input_tokens)           AS total_input_tokens,
  SUM(output_tokens)          AS total_output_tokens,
  SUM(cache_read_tokens)      AS total_cache_read_tokens,
  SUM(cache_creation_tokens)  AS total_cache_creation_tokens
FROM usage_records
WHERE project_id = ANY($projectIds)
  AND timestamp BETWEEN $from AND $to`}</code>
      </pre>

      <h3>estimatedCostUsd — 추정 비용</h3>
      <p>
        <code>packages/shared/src/constants/pricing.ts</code>의 모델별 단가($/1M token)와
        토큰 수를 곱해 계산한 추정값입니다.
        실제 청구 금액과 다를 수 있습니다 — Anthropic 공식 인보이스를 기준으로 삼아야 합니다.
        대부분의 사용자는 구독 플랜이므로 이 숫자는 &ldquo;추정 소비량 참고용&rdquo;으로만 활용하세요.
      </p>

      <hr />

      <h2>죽은 skill / agent 판별 예시</h2>
      <p>
        다음은 &ldquo;실질적으로 사용되지 않는&rdquo; skill·agent를 식별하는 예시 임계값입니다.
        이 임계값은 제안일 뿐이며, 조직의 실제 사용 패턴에 따라 기준을 달리하십시오.
        Argos UI에서는 자동 라벨·경고·색상 표시를 하지 않습니다 — 판단은 조직 몫입니다.
      </p>
      <ul>
        <li>최근 30일 <code>callCount == 0</code> AND <code>userCount &lt;= 1</code></li>
        <li>최근 90일 <code>callCount &lt; 5</code> AND <code>sessionCount == 1</code></li>
      </ul>
      <p>
        위 조건을 직접 확인하려면 대시보드의 날짜 범위를 조정해 callCount·userCount를 비교하세요.
      </p>

      <hr />

      <h2>successRate를 노출하지 않는 이유</h2>
      <p>
        원안 요구사항은{' '}
        <code>POST_TOOL_USE 이벤트 중 exit_code가 null 또는 0인 비율</code>을{' '}
        successRate로 정의하고 이를 Skills/Agents 대시보드에 노출하는 것을 제안했습니다.
      </p>
      <p>
        그러나 2026-04-24 프로덕션 실측 결과, Claude Code hook API가 내장 도구(Skill/Agent 포함)에
        대해 <code>POST_TOOL_USE</code> 이벤트를 발사하지 않거나 <code>exit_code</code>를
        제공하지 않음이 확인되었습니다. 수집 파이프라인(<code>packages/cli</code>)은 정상 동작하나
        Claude Code 자체가 해당 페이로드를 공급하지 않습니다.
        데이터가 없는 지표를 노출하면 &ldquo;0% 성공률&rdquo; 같은 오해를 유발하므로 보류했습니다.
      </p>
      <p>
        대신 <code>medianDurationMs</code>(tool 완료 시간 중앙값)를 대체 지표로 채택했습니다.
        완료 시간 분포로 skill의 복잡도와 안정성을 간접적으로 가늠할 수 있습니다.
      </p>
      <p>
        <strong>
          재도입 트리거: Claude Code hook이 Skill/Agent 도구에 대해 PostToolUse + exit_code를
          제공하기 시작하면 즉시 재도입 검토.
        </strong>{' '}
        재도입 시 이 페이지와 InfoTooltip·타입 정의를 함께 업데이트해야 합니다.
      </p>

      <hr />

      <h2>제한 사항 (Limitations)</h2>
      <ul>
        <li>
          <strong>toolInput / toolResponse는 지표 집계에 사용되지 않습니다.</strong>{' '}
          Skill 호출 인자나 실행 결과는 저장되지만, 대시보드 지표 계산에는 메타데이터(호출 횟수·
          세션·사용자·실행 시간)만 사용합니다. 코드·프롬프트 내용은 수집하지 않으므로 privacy가
          보호됩니다.
        </li>
        <li>
          <strong>medianDurationMs는 세션 종료 후 반영됩니다.</strong>{' '}
          <code>messages.duration_ms</code>는 Stop 이벤트 시 transcript 재빌드를 통해 채워지므로,
          진행 중인 세션의 tool call은 집계에 지연이 있을 수 있습니다.
        </li>
        <li>
          <strong>샘플 임계값 3은 통계적 유의수준이 아닙니다.</strong>{' '}
          매우 적은 샘플(1~2건)의 경우 중앙값이 단일 관측치와 동일해 오해를 유발할 수 있으므로
          숨기는 것이 목적입니다. 통계적으로 신뢰할 수 있는 샘플 수(보통 30+건)와 다릅니다.
        </li>
      </ul>

      <hr />

      <p>
        데이터가 예상과 다르면{' '}
        <a href="mailto:support@argos-ai.xyz">support@argos-ai.xyz</a>로 연락해 주세요.
      </p>

      <p className="text-xs text-muted-foreground mt-8">
        이 페이지는{' '}
        <code>packages/web/src/app/docs/metrics-methodology/page.tsx</code>.
        수정은 PR로.
      </p>
    </article>
  )
}
