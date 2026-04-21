-- Dashboard용 일별 rollup 캐시 테이블.
-- past 날짜에 대해 lazy하게 계산/upsert 후 이후 조회는 이 테이블에서만 읽는다.
-- "오늘"은 캐시하지 않고 매 요청마다 live 집계한다.
CREATE TABLE "daily_project_stats" (
  "project_id"            TEXT    NOT NULL,
  "date"                  DATE    NOT NULL,

  "session_count"         INT     NOT NULL DEFAULT 0,
  "turn_count"            INT     NOT NULL DEFAULT 0,
  "active_user_count"     INT     NOT NULL DEFAULT 0,

  "input_tokens"          BIGINT  NOT NULL DEFAULT 0,
  "output_tokens"         BIGINT  NOT NULL DEFAULT 0,
  "cache_read_tokens"     BIGINT  NOT NULL DEFAULT 0,
  "cache_creation_tokens" BIGINT  NOT NULL DEFAULT 0,
  "estimated_cost_usd"    DOUBLE PRECISION NOT NULL DEFAULT 0,

  "active_user_ids"       JSONB   NOT NULL DEFAULT '[]',
  "skill_counts"          JSONB   NOT NULL DEFAULT '{}',
  "agent_counts"          JSONB   NOT NULL DEFAULT '{}',
  "model_tokens"          JSONB   NOT NULL DEFAULT '{}',
  "user_stats"            JSONB   NOT NULL DEFAULT '[]',

  "computed_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "daily_project_stats_pkey" PRIMARY KEY ("project_id", "date"),
  CONSTRAINT "daily_project_stats_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
