-- ======================================================================
-- visitors & files RLS migration v2
-- 目标：收紧 anon 对 visitors/files 的直接表访问，
-- 同时保留现有应用功能（访客跟踪写入、文件分享页公开读、下载计数）。
--
-- 前提：站点的 anon key 会打进浏览器 bundle，等同于公开。
-- 所以凡是"不该被任何人读到"的数据，anon 一律不给 SELECT。
-- 后台管理操作走 service_role key（绕过 RLS），不存在权限问题。
--
-- 变更摘要：
--   visitors: anon 可 INSERT（中间件/track.ts 写入），不可 SELECT/UPDATE/DELETE
--   files:    anon 不可直接 SELECT/INSERT/UPDATE/DELETE（全走服务端）
--             但 increment_downloads RPC 允许 anon 调用（公开下载计数）
--
-- 安全注意：
--   旧策略可能叫任意名字（allow_all / anon_read / public_read 等），
--   所以用 DO 块 + pg_policies 动态删除全部旧策略，不靠猜名字。
--   此脚本幂等，可安全重复执行。
-- ======================================================================

-- ── visitors ──────────────────────────────────────────────────────
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

-- 动态删除 visitors 表上的所有现有策略（不靠猜名字）
DO $$
DECLARE
  pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'visitors' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON visitors', pol);
  END LOOP;
END $$;

-- anon 可插入访客记录（中间件 /api/visitors/track.ts 需要写入）
-- 但不允许 anon 读取（IP 是隐私数据）
CREATE POLICY anon_insert_visitors ON visitors
  FOR INSERT TO anon
  WITH CHECK (true);

-- service_role 绕过 RLS，后台读取不受影响
-- 不创建任何 SELECT 策略 → anon 无法 SELECT visitors

-- ── files ─────────────────────────────────────────────────────────
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- 动态删除 files 表上的所有现有策略（不靠猜名字）
DO $$
DECLARE
  pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'files' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON files', pol);
  END LOOP;
END $$;

-- files 表不对 anon 开放任何直接表操作
-- 公开分享页 /s/[slug] 和密码验证 /api/files/verify 走 service_role 客户端
-- 下载计数 /api/files/download 走 increment_downloads RPC

-- 确保 increment_downloads 函数存在且标记为 SECURITY DEFINER
-- 这样 anon 调用 RPC 时以函数 owner 权限执行，能更新 downloads 列
-- 而不需要 anon 对 files 表有 UPDATE 权限
CREATE OR REPLACE FUNCTION increment_downloads(slug TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE files SET downloads = downloads + 1 WHERE share_slug = slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 允许 anon 调用下载计数 RPC
-- 注意：RPC 层面没有独立的 GRANT 机制（PostgREST 走路由权限），
-- 只要函数是 SECURITY DEFINER 且 schema 上 anon 有 EXECUTE 即可。
-- Supabase 默认 anon 对 public schema 有 EXECUTE 权限，无需额外 GRANT。

-- 验证：执行后用 anon key 测试
-- curl "$SUPA/rest/v1/visitors?select=*&limit=1" -H "apikey: $ANON_KEY" → 应返回 200 []
-- curl "$SUPA/rest/v1/files?select=*&limit=1" -H "apikey: $ANON_KEY" → 应返回 200 []
-- curl "$SUPA/rest/v1/rpc/increment_downloads" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"slug":"test"}' → 应返回 204
