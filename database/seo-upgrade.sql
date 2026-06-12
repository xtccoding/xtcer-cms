-- ============================================================
-- XTCer SEO 升级 Migration
-- 请在 Supabase Dashboard > SQL Editor 中按顺序执行
-- ============================================================

-- 1. 给 posts 表添加 tags 列
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- 2. 给 posts 表添加 summary 列（如果还没有）
-- （你的 database.types.ts 已经定义了 summary，确认列存在即可）

-- 3. 创建 GIN 索引加速 tags 数组查询
CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_feeds_tags ON feeds USING GIN (tags);

-- 4. (可选) 启用 pgvector 扩展 — 用于向量相似度推荐
-- 在 Supabase Dashboard > SQL Editor 执行：
CREATE EXTENSION IF NOT EXISTS vector;

-- 5. (可选) 给 posts 表添加 embedding 列
ALTER TABLE posts ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 6. (可选) 创建 HNSW 索引加速向量查询
CREATE INDEX IF NOT EXISTS idx_posts_embedding ON posts USING hnsw (embedding vector_cosine_ops);

-- 7. (可选) 创建相似度查询函数
CREATE OR REPLACE FUNCTION match_posts(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id text,
  title text,
  summary text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    posts.id,
    posts.title,
    posts.summary,
    1 - (posts.embedding <=> query_embedding) AS similarity
  FROM posts
  WHERE posts.embedding IS NOT NULL
    AND 1 - (posts.embedding <=> query_embedding) > match_threshold
  ORDER BY posts.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 执行完毕后，你的数据库就支持：
-- ✅ posts.tags 数组字段 + GIN 索引
-- ✅ pgvector 向量存储 + HNSW 索引
-- ✅ 相似文章查询函数
-- ============================================================
