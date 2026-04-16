-- DropIndex (replace plain index with unique constraint)
DROP INDEX IF EXISTS "messages_session_id_sequence_idx";

-- Delete existing duplicates before adding unique constraint
-- Keep the first inserted row (smallest id) for each (session_id, sequence) pair
DELETE FROM "messages" a
USING "messages" b
WHERE a.session_id = b.session_id
  AND a.sequence = b.sequence
  AND a.id > b.id;

-- CreateIndex
CREATE UNIQUE INDEX "messages_session_id_sequence_key" ON "messages"("session_id", "sequence");
