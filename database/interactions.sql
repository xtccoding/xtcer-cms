-- ============================================================
-- 互动功能（点赞 deal_likes + 提意见 feedback）
--
-- ⚠️ 部署需要三步，缺一不可：
--   1) 在 Supabase Dashboard → SQL Editor 中手动执行本文件。
--      （线上库用的是 anon key，没有 DDL 权限，无法自动建表。）
--   2) 在 Cloudflare Pages → Settings → Environment variables 配置
--      LIKE_SALT = 任意长随机串（用于对客户端 IP 做 SHA-256 加盐哈希）。
--      未配置时点赞 / 提意见接口会 fail closed（返回不可用），不会用公开盐假装匿名。
--   3) 在 Cloudflare Pages → Settings → Environment variables 配置
--      SUPABASE_SERVICE_ROLE_KEY = Supabase Dashboard → Project Settings → API 里的
--      service_role 密钥。**变量名不能带 PUBLIC_ 前缀**（带了会被打进浏览器产物）。
--      仅用于后台「意见反馈」页在服务端读取 feedback —— 该表对 anon 只开放写入，
--      后台要读只能走 service_role。未配置时后台反馈页会显示配置指引，不会报错。
--
-- 幂等：可重复执行，不会报错、不会重复建表 / 重复计数。
-- ============================================================

-- ---------- 点赞表 ----------
-- 同一个人（同 IP 哈希）对同一目标只能点一次：靠 (target, ip_hash) 唯一约束兜底。
-- ip_hash = SHA-256(salt + ip)，绝不存明文 IP。
CREATE TABLE IF NOT EXISTS deal_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT deal_likes_target_ip_unique UNIQUE (target, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_deal_likes_target ON deal_likes(target);

-- ---------- 提意见表 ----------
-- message 为纯文本，只入库、绝不在公开页面渲染（消除存储型 XSS）。
-- handled = 站长是否已在后台标记处理过，仅后台可见、由 service_role 更新。
-- 隐私：反馈正文仅供站长在后台「意见反馈」页 / Supabase Dashboard → Table Editor 查看，
--       不对 anon 开放 SELECT —— anon key 会打进浏览器 bundle，等于公开，
--       若开放读权限，任何人都能拉走全部反馈（可能含联系方式等敏感信息）。
CREATE TABLE IF NOT EXISTS feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  contact TEXT,
  ip_hash TEXT,
  path TEXT,
  handled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 兼容旧版本：若此前已执行过不含 handled 的建表语句，这里补列（幂等）。
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS handled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- ---------- RLS：anon 只允许 INSERT + SELECT，禁止 UPDATE / DELETE ----------
-- 注意：不要照抄其他表的 allow_all_* 全放开策略，互动表必须收窄。

ALTER TABLE deal_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_likes anon insert" ON deal_likes;
CREATE POLICY "deal_likes anon insert" ON deal_likes
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "deal_likes anon select" ON deal_likes;
CREATE POLICY "deal_likes anon select" ON deal_likes
  FOR SELECT USING (true);

-- feedback：只允许 INSERT，**不开放 SELECT**（见上方隐私说明）。
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback anon insert" ON feedback;
CREATE POLICY "feedback anon insert" ON feedback
  FOR INSERT WITH CHECK (true);

-- 清理历史误建的 SELECT 策略（若曾执行过旧版 SQL），保持幂等。
DROP POLICY IF EXISTS "feedback anon select" ON feedback;

-- ---------- GRANT：显式授予 anon 最小权限（无 UPDATE / DELETE）----------
GRANT INSERT, SELECT ON deal_likes TO anon;
-- feedback 仅 INSERT，不给 anon 读权限。
GRANT INSERT ON feedback TO anon;

-- 后台读取走 service_role：它自带 BYPASSRLS，无需（也不应）为此给 anon 加读权限。
-- 所以这里刻意不写 "GRANT SELECT ON feedback TO anon"。
