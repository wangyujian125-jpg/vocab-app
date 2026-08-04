-- ============================================================================
-- Contextual English Vocabulary Learning App - Database Schema
-- ============================================================================
-- How to run this in Supabase SQL Editor:
--
--   1. Log in to your Supabase project dashboard (https://supabase.com/dashboard)
--   2. In the left sidebar, click on "SQL Editor"
--   3. Click the "New query" button to open a fresh editor tab
--   4. Copy the entire contents of this file and paste it into the editor
--   5. Click the "Run" button (or press Ctrl+Enter) to execute the script
--   6. After successful execution, the four tables will appear under
--      "Table Editor" and all RLS policies / triggers will be active
--
-- What this script creates:
--   - 4 tables: custom_words, wrong_words, plans, progress
--   - Row Level Security (RLS) enabled on every table
--   - Per-user policies (SELECT / INSERT / UPDATE / DELETE) on every table
--   - Indexes on user_id for fast per-user lookups
--   - A trigger that auto-updates the `updated_at` column on the plans table
--
-- Notes:
--   - This script is idempotent: it uses IF NOT EXISTS / IF NOT EXISTS so it
--     can be safely re-run without errors.
--   - All tables are linked to auth.users(id) with ON DELETE CASCADE, so when
--     a user is deleted from Supabase Auth, their data is automatically removed.
-- ============================================================================

-- Enable the pgcrypto extension (provides gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================================
-- Table 1: custom_words  -  User's custom vocabulary words
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_words (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word        text        NOT NULL,
    pos         text        NOT NULL DEFAULT 'n',
    meaning     text        NOT NULL,
    phonetic    text        DEFAULT '',
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_words_user_id ON custom_words(user_id);

ALTER TABLE custom_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_words_select_own ON custom_words;
CREATE POLICY custom_words_select_own ON custom_words
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS custom_words_insert_own ON custom_words;
CREATE POLICY custom_words_insert_own ON custom_words
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS custom_words_update_own ON custom_words;
CREATE POLICY custom_words_update_own ON custom_words
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS custom_words_delete_own ON custom_words;
CREATE POLICY custom_words_delete_own ON custom_words
    FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ============================================================================
-- Table 2: wrong_words  -  Words the user got wrong / wants to review
-- ============================================================================
CREATE TABLE IF NOT EXISTS wrong_words (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word        text        NOT NULL,
    pos         text        NOT NULL DEFAULT 'n',
    meaning     text        NOT NULL,
    phonetic    text        DEFAULT '',
    added_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wrong_words_user_id ON wrong_words(user_id);

ALTER TABLE wrong_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wrong_words_select_own ON wrong_words;
CREATE POLICY wrong_words_select_own ON wrong_words
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS wrong_words_insert_own ON wrong_words;
CREATE POLICY wrong_words_insert_own ON wrong_words
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS wrong_words_update_own ON wrong_words;
CREATE POLICY wrong_words_update_own ON wrong_words
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS wrong_words_delete_own ON wrong_words;
CREATE POLICY wrong_words_delete_own ON wrong_words
    FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ============================================================================
-- Table 3: plans  -  Learning plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS plans (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    bank_id       text        NOT NULL,
    bank_name     text        NOT NULL,
    theme         text        NOT NULL DEFAULT 'kaoyan',
    total_words   integer     NOT NULL DEFAULT 0,
    total_days    integer     NOT NULL DEFAULT 10,
    current_day   integer     NOT NULL DEFAULT 1,
    plan_data     jsonb,
    created_at    timestamptz DEFAULT now(),
    updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select_own ON plans;
CREATE POLICY plans_select_own ON plans
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS plans_insert_own ON plans;
CREATE POLICY plans_insert_own ON plans
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS plans_update_own ON plans;
CREATE POLICY plans_update_own ON plans
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS plans_delete_own ON plans;
CREATE POLICY plans_delete_own ON plans
    FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ============================================================================
-- Table 4: progress  -  Daily study progress tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS progress (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    study_date      date        NOT NULL DEFAULT current_date,
    words_learned   integer     NOT NULL DEFAULT 0,
    words_reviewed  integer     NOT NULL DEFAULT 0,
    day_number      integer     NOT NULL DEFAULT 1,
    created_at      timestamptz DEFAULT now(),
    CONSTRAINT progress_user_date_unique UNIQUE (user_id, study_date)
);

CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id);

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS progress_select_own ON progress;
CREATE POLICY progress_select_own ON progress
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS progress_insert_own ON progress;
CREATE POLICY progress_insert_own ON progress
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS progress_update_own ON progress;
CREATE POLICY progress_update_own ON progress
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS progress_delete_own ON progress;
CREATE POLICY progress_delete_own ON progress
    FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ============================================================================
-- Storage Bucket: vocab-images（单词配图存储）
-- ============================================================================
-- 在 Supabase Dashboard → Storage 中手动创建 bucket "vocab-images"（公开读），
-- 或执行以下 SQL（需要 service_role 权限，在 SQL Editor 中运行）：

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('vocab-images', 'vocab-images', true)
-- ON CONFLICT (id) DO NOTHING;

-- Bucket Policy: 每个登录用户只能管理自己 uid 文件夹下的图片
-- DROP POLICY IF EXISTS "vocab-images-upload" ON storage.objects;
-- CREATE POLICY "vocab-images-upload" ON storage.objects
--     FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'vocab-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- DROP POLICY IF EXISTS "vocab-images-read" ON storage.objects;
-- CREATE POLICY "vocab-images-read" ON storage.objects
--     FOR SELECT USING (bucket_id = 'vocab-images');

-- DROP POLICY IF EXISTS "vocab-images-delete" ON storage.objects;
-- CREATE POLICY "vocab-images-delete" ON storage.objects
--     FOR DELETE TO authenticated
--     USING (bucket_id = 'vocab-images' AND (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================================
-- Trigger: auto-update updated_at on the plans table
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_plans_updated_at ON plans;
CREATE TRIGGER trigger_plans_updated_at
    BEFORE UPDATE ON plans
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
