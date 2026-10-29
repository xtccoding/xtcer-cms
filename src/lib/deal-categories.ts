// 优惠分类的中文名。前台 /deals 与后台 /xadminx/deals 共用这一份，避免两边不一致。
export const categoryMap: Record<string, string> = {
  compute: '云服务器',
  nat: 'NAT VPS',
  container: '容器托管',
  shared: '虚拟主机',
  hosting: '静态托管',
  tunnel: '内网穿透',
  cdn: 'CDN 加速',
  storage: '存储',
  database: '数据库',
  domain: '域名',
  ai: 'AI 额度',
  ai_tool: 'AI 编程',
  api: 'API',
  other: '其他',
}

export const catLabel = (c: string): string => categoryMap[c] || c || '未分类'
