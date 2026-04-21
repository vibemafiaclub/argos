-- usage_records를 session_id로 JOIN/집계하는 쿼리(sessions 리스트의 "Most tokens" 정렬,
-- 기존 세션별 usageRecords include 등)에서 sequential scan을 피하기 위한 인덱스.
CREATE INDEX "usage_records_session_id_idx" ON "usage_records"("session_id");
