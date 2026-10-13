-- CreateTable
CREATE TABLE "reading_items" (
    "id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "topic" VARCHAR(255) NOT NULL,
    "passage" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_label" VARCHAR(1) NOT NULL,
    "source" VARCHAR(16) NOT NULL DEFAULT 'seed',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_tasks" (
    "id" UUID NOT NULL,
    "task_type" VARCHAR(32) NOT NULL,
    "stanag_level" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "instructions" TEXT NOT NULL,
    "word_count_min" INTEGER NOT NULL,
    "word_count_max" INTEGER NOT NULL,
    "rubric" JSONB NOT NULL,
    "options" JSONB NOT NULL,
    "source" VARCHAR(16) NOT NULL DEFAULT 'seed',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_items" (
    "id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "topic" VARCHAR(255) NOT NULL,
    "conversation_type" VARCHAR(64) NOT NULL,
    "setting" TEXT,
    "voices" JSONB NOT NULL,
    "speakers" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "questions" JSONB NOT NULL,
    "audio_path" VARCHAR(255),
    "has_key" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(16) NOT NULL DEFAULT 'seed',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listening_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_entries" (
    "id" UUID NOT NULL,
    "part" VARCHAR(8) NOT NULL,
    "section" VARCHAR(255) NOT NULL,
    "term_en" TEXT NOT NULL,
    "translation_it" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocab_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sessions" (
    "id" UUID NOT NULL,
    "mode" VARCHAR(16) NOT NULL,
    "skill" VARCHAR(16),
    "status" VARCHAR(16) NOT NULL DEFAULT 'in_progress',
    "config" JSONB,
    "result" JSONB,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "item_type" VARCHAR(16) NOT NULL,
    "item_id" UUID NOT NULL,
    "question_index" INTEGER NOT NULL DEFAULT 0,
    "chosen_label" VARCHAR(1),
    "response_text" TEXT,
    "is_correct" BOOLEAN,
    "score" DOUBLE PRECISION,
    "feedback" JSONB,
    "answered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_stats" (
    "id" UUID NOT NULL,
    "skill" VARCHAR(16) NOT NULL,
    "level" INTEGER NOT NULL,
    "topic" VARCHAR(255) NOT NULL,
    "seen" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "topic_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_items" (
    "id" UUID NOT NULL,
    "item_type" VARCHAR(16) NOT NULL,
    "item_id" UUID NOT NULL,
    "question_index" INTEGER NOT NULL DEFAULT 0,
    "due_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interval_days" INTEGER NOT NULL DEFAULT 0,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "last_result" BOOLEAN,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reading_items_level_idx" ON "reading_items"("level");

-- CreateIndex
CREATE INDEX "reading_items_topic_idx" ON "reading_items"("topic");

-- CreateIndex
CREATE INDEX "listening_items_level_idx" ON "listening_items"("level");

-- CreateIndex
CREATE INDEX "vocab_entries_part_idx" ON "vocab_entries"("part");

-- CreateIndex
CREATE INDEX "vocab_entries_section_idx" ON "vocab_entries"("section");

-- CreateIndex
CREATE INDEX "exam_sessions_mode_idx" ON "exam_sessions"("mode");

-- CreateIndex
CREATE INDEX "answers_session_id_idx" ON "answers"("session_id");

-- CreateIndex
CREATE INDEX "answers_item_type_item_id_idx" ON "answers"("item_type", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_stats_skill_level_topic_key" ON "topic_stats"("skill", "level", "topic");

-- CreateIndex
CREATE INDEX "review_items_due_at_idx" ON "review_items"("due_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_items_item_type_item_id_question_index_key" ON "review_items"("item_type", "item_id", "question_index");

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
