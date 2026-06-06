-- 站点配置表
CREATE TABLE IF NOT EXISTS site_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(key);

-- 插入默认配置
INSERT INTO site_settings (key, value) VALUES
-- Banner 文字配置
('banner', '{
  "title_line1": "探索前沿",
  "title_line2": "洞见未来",
  "title_dot": "·",
  "tagline_en": "eXploring Tech",
  "tagline_cn": "技术探索者",
  "desc_items": ["AI 情报", "安全漏洞", "云服务优惠", "技术深度"]
}'),

-- 粒子效果配置
('particles', '{
  "mode": "siri",
  "background_particles": {
    "count": 120,
    "size_min": 0.5,
    "size_max": 2,
    "opacity_min": 0.05,
    "opacity_max": 0.35,
    "speed": 0.3,
    "color": "41, 151, 255"
  },
  "siri_wave": {
    "layers": 5,
    "base_radius": 80,
    "layer_spacing": 15,
    "wave_amplitude": 8,
    "wave_frequency": 3,
    "speed": 0.02,
    "colors": ["200, 80%, 60%", "215, 80%, 60%", "230, 80%, 60%", "245, 80%, 60%", "260, 80%, 60%"]
  },
  "single_ring": {
    "radius": 100,
    "wave_amplitude": 12,
    "speed": 0.015,
    "color": "41, 151, 255"
  },
  "double_ring": {
    "radius1": 80,
    "radius2": 120,
    "wave_amplitude": 10,
    "speed": 0.02,
    "color1": "41, 151, 255",
    "color2": "191, 90, 242"
  },
  "mouse_effect": {
    "enabled": true,
    "radius": 40,
    "pulse_speed": 0.03
  }
}')

ON CONFLICT (key) DO NOTHING;

-- 启用 RLS
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取
CREATE POLICY "Allow public read" ON site_settings
  FOR SELECT USING (true);

-- 允许认证用户写入（管理员）
CREATE POLICY "Allow authenticated write" ON site_settings
  FOR ALL USING (auth.role() = 'authenticated');
