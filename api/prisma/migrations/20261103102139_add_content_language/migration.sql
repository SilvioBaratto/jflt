-- DropIndex
DROP INDEX "topic_stats_skill_level_topic_key";

-- AlterTable
ALTER TABLE "exam_sessions" ADD COLUMN     "language" VARCHAR(2) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "listening_items" ADD COLUMN     "language" VARCHAR(2) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "reading_items" ADD COLUMN     "language" VARCHAR(2) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "topic_stats" ADD COLUMN     "language" VARCHAR(2) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "vocab_entries" ADD COLUMN     "language" VARCHAR(2) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "writing_tasks" ADD COLUMN     "language" VARCHAR(2) NOT NULL DEFAULT 'en';

-- CreateIndex
CREATE INDEX "exam_sessions_language_idx" ON "exam_sessions"("language");

-- CreateIndex
CREATE INDEX "listening_items_language_level_idx" ON "listening_items"("language", "level");

-- CreateIndex
CREATE INDEX "reading_items_language_level_idx" ON "reading_items"("language", "level");

-- CreateIndex
CREATE UNIQUE INDEX "topic_stats_language_skill_level_topic_key" ON "topic_stats"("language", "skill", "level", "topic");

-- CreateIndex
CREATE INDEX "vocab_entries_language_idx" ON "vocab_entries"("language");

-- CreateIndex
CREATE INDEX "writing_tasks_language_idx" ON "writing_tasks"("language");
