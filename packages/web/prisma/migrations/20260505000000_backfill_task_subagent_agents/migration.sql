-- Treat Claude Code Task tool calls with subagent_type as sub-agent calls.
-- Existing daily rollup rows for affected project/date pairs are invalidated
-- so they are recomputed lazily on the next dashboard request.
WITH updated_events AS (
  UPDATE "events"
  SET
    "is_agent_call" = true,
    "agent_type" = NULLIF("tool_input"->>'subagent_type', ''),
    "agent_desc" = NULLIF("tool_input"->>'description', '')
  WHERE "tool_name" IN ('Agent', 'Task')
    AND "tool_input" IS NOT NULL
    AND "tool_input" ? 'subagent_type'
    AND NULLIF("tool_input"->>'subagent_type', '') IS NOT NULL
    AND (
      "is_agent_call" IS DISTINCT FROM true
      OR "agent_type" IS DISTINCT FROM NULLIF("tool_input"->>'subagent_type', '')
      OR "agent_desc" IS DISTINCT FROM NULLIF("tool_input"->>'description', '')
    )
  RETURNING "project_id", DATE("timestamp") AS "date"
)
DELETE FROM "daily_project_stats" d
USING (
  SELECT DISTINCT "project_id", "date"
  FROM updated_events
) u
WHERE d."project_id" = u."project_id"
  AND d."date" = u."date";
