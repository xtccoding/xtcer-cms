-- XTcer CMS - AI Search Optimization Migration
-- Execute this in Supabase SQL Editor
-- Date: 2026-06-13

-- ==================== Add author and updated_at to posts ====================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author TEXT DEFAULT 'XTcer';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for author queries
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author);
CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated_at DESC);

-- Update existing posts to set updated_at = created_at
UPDATE posts SET updated_at = created_at WHERE updated_at IS NULL;
