-- ======================================================================
-- visitors & files RLS migration v3
-- 
-- v1: 只删固定名字的策略 → visitors 有不同名字的策略存活
-- v2: 用 DO $$ 块动态删 → Supabase SQL Editor 可能不支持 DO 块
-- v3: 用 ALTER TABLE ... FORCE ROW LEVEL SECURITY + REVOKE 直接封死
-- ======================================================================

-- ── visitors ──────────────────────────────────────────────────────
-- 先强制启用 RLS（即使之前已启用也不报错）
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

-- 强制 RLS：即使 table owner 也要受策略约束
-- 这一步确保不会有遗漏
ALTER TABLE visitors FORCE ROW LEVEL SECURITY;

-- 删除所有可能名字的旧策略（覆盖 Supabase 常见命名 + 项目历史命名）
DROP POLICY IF EXISTS allow_all_visitors ON visitors;
DROP POLICY IF EXISTS allow_all ON visitors;
DROP POLICY IF EXISTS anon_insert_visitors ON visitors;
DROP POLICY IF EXISTS anon_select_visitors ON visitors;
DROP POLICY IF EXISTS visitors_select_policy ON visitors;
DROP POLICY IF EXISTS visitors_insert_policy ON visitors;
DROP POLICY IF EXISTS "Allow all access to visitors" ON visitors;
DROP POLICY IF EXISTS "visitors anon read" ON visitors;
DROP POLICY IF EXISTS "public visitors select" ON visitors;

-- 撤销 anon 对 visitors 的 SELECT 权限（双保险：即使有策略也读不了）
REVOKE SELECT ON visitors FROM anon;

-- 只保留 anon 的 INSERT（中间件访客跟踪需要写入）
-- 如果之前的 INSERT 策略被上面的 DROP 删了，这里重建
CREATE POLICY anon_insert_visitors ON visitors
  FOR INSERT TO anon
  WITH CHECK (true);

-- ── files ─────────────────────────────────────────────────────────
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;

-- 删除所有旧策略
DROP POLICY IF EXISTS allow_all_files ON files;
DROP POLICY IF EXISTS allow_all ON files;
DROP POLICY IF EXISTS anon_insert_files ON files;
DROP POLICY IF EXISTS anon_select_files ON files;
DROP POLICY IF EXISTS anon_update_files ON files;
DROP POLICY IF EXISTS anon_delete_files ON files;
DROP POLICY IF EXISTS files_select_policy ON files;
DROP POLICY IF EXISTS "Allow all access to files" ON files;
DROP POLICY IF EXISTS "files anon read" ON files;

-- 撤销 anon 对 files 的所有直接表权限
REVOKE SELECT, INSERT, UPDATE, DELETE ON files FROM anon;

-- ── increment_downloads RPC ──────────────────────────────────────
-- SECURITY DEFINER 让 anon 能通过 RPC 增加下载计数
-- 而不需要对 files 表有 UPDATE 权限
CREATE OR REPLACE FUNCTION increment_downloads(slug TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE files SET downloads = downloads + 1 WHERE share_slug = slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════
-- 验证（执行完后再跑下面这些 curl，确认 anon 读不到了）：
--
--   # visitors → 应该返回 401 或 200 []
--   curl "$SUPA/rest/v1/visitors?select=ip&limit=1" -H "apikey: $ANON"
--
--   # files → 应该返回 401 或 200 []
--   curl "$SUPA/rest/v1/files?select=*&limit=1" -H "apikey: $ANON"
--
--   # increment_downloads RPC → 应该返回 204
--   curl -X POST "$SUPA/rest/v1/rpc/increment_downloads" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"slug":"test"}'
-- ══════════════════════════════════════════════════════════════════
