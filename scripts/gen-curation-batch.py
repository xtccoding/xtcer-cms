#!/usr/bin/env python3
"""Generate the TS curation rules for the 2026-10-02 batch (a + b).

The 69 new deals landed without editorial metadata, so their cards show no
payment badges and sort to the bottom. This script emits a ready-to-paste TS
block that closes that gap.

IRON RULE enforced here: every rule that carries `freeNoCard` (or any other
special metadata) MUST also carry `productIncludes`, so it cannot leak onto the
provider's other products.

Run:  python scripts/gen-curation-batch.py            # print the TS block
      python scripts/gen-curation-batch.py --write    # splice into the file
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'deal-curation.ts'

BATCH_COMMENT = '  // ================= 2026-10-02 批次（免费 CDN / 穿透 / 组网 / 存储 / 低价小机）================='

# (provider, productIncludes|None, difficulty, freeNoCard|None, payments, limits)
R = [
    # ---------- 国内支付：CDN / 存储 / 虚拟主机 / 云服务器 ----------
    ('七牛云', 'CDN 免费额度', 'easy', None, ['wechat', 'alipay', 'unionpay'],
     ['免费额度按月赠送，超出按量计费', '需实名认证']),
    ('七牛云', 'Kodo 对象存储', 'easy', None, ['wechat', 'alipay', 'unionpay'],
     ['免费额度有有效期，过期清零', '需实名认证']),
    ('腾讯云', 'COS 对象存储', 'easy', None, ['wechat', 'alipay', 'unionpay'],
     ['免费额度仅限新用户，6 个月后按量计费']),
    ('腾讯云', '轻量应用服务器', 'easy', None, ['wechat', 'alipay', 'unionpay'],
     ['内地节点需备案才能绑定域名']),
    ('腾讯云 TokenHub', None, 'easy', True, [], ['仅新用户一次性赠送，用完即止']),
    ('三丰云', '免费虚拟主机', 'easy', True, [],
     ['需实名认证', '免费机型资源紧张，常开不出来']),
    ('三丰云', '免费云服务器', 'easy', True, [],
     ['需实名认证', '免费机型资源紧张，常开不出来']),
    ('西部数码', '虚拟主机', 'easy', None, ['wechat', 'alipay', 'unionpay'],
     ['首年优惠，续费按标准价']),
    ('亿速互联', '虚拟主机', 'easy', None, ['wechat', 'alipay', 'unionpay'],
     ['首年低价，续费涨价明显']),
    ('景安网络', None, 'easy', None, ['wechat', 'alipay', 'unionpay'],
     ['国内主机需备案']),
    ('蓝队云', None, 'easy', None, ['wechat', 'alipay'],
     ['年付套餐为主，续费价格需自行确认']),
    ('慈云数据', None, 'easy', None, ['wechat', 'alipay'],
     ['香港 CN2 线路，带宽较小']),
    ('华为云', 'Flexus', 'easy', None, ['wechat', 'alipay', 'unionpay'],
     ['内地节点需备案', '促销价仅首年']),
    ('火山引擎', '云服务器', 'easy', None, ['wechat', 'alipay', 'unionpay'],
     ['新用户首年特价，续费按标准价']),
    # ---------- 国内 AI 额度 ----------
    ('智谱 GLM', None, 'easy', True, [], ['免费模型有并发与速率限制']),
    ('硅基流动', None, 'easy', True, [], ['仅部分模型免费，速率受限']),
    ('Kimi 月之暗面', None, 'easy', True, [], ['赠送额度有有效期']),
    ('小米', None, 'easy', True, [], ['限时活动，额度用完即止']),
    ('阿里云百炼', None, 'easy', True, [],
     ['各模型免费额度独立计算', '免费额度有效期 180 天']),
    ('DeepSeek', '新用户免费额度', 'easy', True, [], ['赠送额度有有效期']),
    ('DeepSeek', 'DeepSeek API', 'easy', None, ['wechat', 'alipay'],
     ['按 token 计费，需先充值']),
    # ---------- 免费静态资源 CDN ----------
    ('jsDelivr', 'CDN', 'easy', True, [],
     ['只能托管开源 / 公开仓库的文件', '单文件与单仓库有大小上限']),
    ('GitHub', 'Pages', 'easy', True, [],
     ['仓库 1GB，每月 100GB 软流量上限']),
    ('Statically', None, 'easy', True, [], ['只镜像 GitHub / npm 上的公开资源']),
    ('unpkg', None, 'easy', True, [], ['直接映射 npm 包，生产环境建议自建']),
    ('esm.sh', None, 'easy', True, [], ['按需编译 ESM，首次请求较慢']),
    ('cdnjs', None, 'easy', True, [], ['只镜像开源库，不能托管私有文件']),
    ('BootstrapCDN', None, 'easy', True, [], ['只镜像 Bootstrap 等固定库']),
    ('Staticfile', None, 'easy', True, [], ['只镜像开源公共库']),
    ('360 前端静态资源库', None, 'easy', True, [], ['只镜像开源公共库']),
    ('Google Fonts', None, 'easy', True, [], ['国内访问建议走镜像站']),
    ('Font Awesome', None, 'easy', True, [], ['免费版仅含部分图标']),
    # ---------- 免费 CDN / 边缘 ----------
    ('Cloudflare', '免费版 CDN', 'easy', True, [],
     ['免费版不含高级 WAF 与图片优化']),
    ('Tencent EdgeOne', '免费版', 'easy', True, [],
     ['需腾讯云实名认证', '免费版不含高级安全防护']),
    ('Amazon CloudFront', 'Free 计划', 'easy', None, ['card'],
     ['每月 100GB 出网 + 100 万请求']),
    ('Cloudflare R2', '免费额度', 'easy', None, ['card'],
     ['免费 10GB 存储，出网免费', '需绑定支付方式才启用']),
    ('KeyCDN', None, 'medium', None, ['card', 'paypal'],
     ['无免费额度，最低充值 $5']),
    # ---------- 免费虚拟主机 ----------
    ('InfinityFree', None, 'easy', True, [],
     ['不支持对外发信', '有并发限制与强制广告']),
    ('AwardSpace', None, 'easy', True, [], ['免费档仅 1GB 空间，页面带广告']),
    # ---------- 组网 / 内网穿透 ----------
    ('Tailscale', None, 'easy', True, [], ['免费档限 3 用户 / 100 台设备']),
    ('ZeroTier', None, 'easy', True, [], ['免费档限 25 个节点']),
    ('NetBird', None, 'easy', True, [], ['免费档限 100 台设备']),
    ('Twingate', None, 'easy', True, [], ['免费档限 5 用户']),
    ('remote.it', None, 'easy', True, [], ['免费档限少量设备']),
    ('Microsoft Dev Tunnels', None, 'easy', True, [],
     ['需微软账号', '隧道为临时地址，重启即变']),
    ('ngrok', None, 'easy', True, [],
     ['免费版为随机域名，重启换地址']),
    ('localhost.run', None, 'easy', True, [], ['免费隧道为临时随机地址']),
    ('Pinggy', None, 'easy', True, [], ['免费隧道单次有效期 60 分钟']),
    ('LocalXpose', None, 'easy', True, [], ['免费隧道为随机域名且限速']),
    ('zrok', None, 'easy', True, [], ['免费额度有限，超出需升级']),
    ('playit.gg', None, 'easy', True, [], ['免费隧道带宽与并发受限']),
    ('tunnelto', None, 'easy', True, [], ['开源工具，也可自建服务端']),
    ('OpenFrp', None, 'easy', True, [], ['公益节点不稳定，随时可能停服']),
    ('SakuraFrp 樱花内网穿透', None, 'easy', True, [],
     ['免费隧道限速，需每日签到领流量']),
    ('natapp', None, 'easy', True, [], ['免费隧道为随机域名，会定时断开']),
    ('Hax.co.id', None, 'easy', True, [],
     ['仅 IPv6 出口，需自备 IPv6 网络', '资源紧张，常开不出来']),
    ('Woiden.id', None, 'easy', True, [],
     ['NAT 共享 IPv4，无独立 IP', '需定期续期，否则回收']),
    # ---------- 免费数据库 / 缓存 ----------
    ('MongoDB Atlas', None, 'easy', True, [], ['M0 免费档上限 512MB 存储']),
    ('Neon', None, 'easy', True, [], ['免费 0.5GB 存储，闲置会挂起']),
    ('CockroachDB', None, 'easy', True, [], ['免费 5GB 存储 + 每月 5000 万 RU']),
    ('Upstash', None, 'easy', True, [], ['免费档每天 1 万次命令']),
    ('Supabase', 'Storage', 'easy', True, [], ['项目闲置 7 天会被自动暂停']),
    ('Supabase', 'PostgreSQL', 'easy', True, [], ['项目闲置 7 天会被自动暂停']),
    # ---------- 免费 PaaS / 容器 ----------
    ('Vercel', None, 'easy', True, [],
     ['免费档仅限非商业用途', '国内访问偶有不稳定']),
    ('Netlify', None, 'easy', True, [], ['每月 100GB 流量，超出需付费']),
    ('Northflank', None, 'easy', None, ['card'], ['免费额度有限，超出按量计费']),
    ('Sealos', None, 'easy', True, [], ['7 天试用，到期需付费续用']),
    ('ClawCloud Run', None, 'easy', True, [],
     ['每月 $5 额度', '需 GitHub 账号注册满 180 天']),
    ('IBM Cloud', None, 'easy', True, [],
     ['部分 Lite 服务 30 天后需手动重建']),
    # ---------- 免费 AI API ----------
    ('Groq', None, 'easy', True, [], ['免费档有每分钟 token 限制']),
    ('OpenRouter', None, 'easy', True, [], [':free 模型有每日请求上限']),
    # ---------- 对象存储（海外） ----------
    ('Backblaze', None, 'easy', None, ['card'],
     ['免费 10GB 存储，出网按量计费']),
    ('Backblaze B2', None, 'easy', None, ['card'],
     ['免费 10GB 存储，搭配 Cloudflare 出网免费']),
    ('Scaleway', None, 'easy', None, ['card'], ['按量计费，需先绑卡']),
    ('Wasabi', None, 'easy', None, ['card'],
     ['按 $6.99/TB/月 计费，最低 1TB 起']),
    ('iDrive e2', None, 'easy', None, ['card'], ['最低 1TB 起购']),
    # ---------- NAT VPS / 低价小机 ----------
    ('C-Servers', 'NanoVPS-II', 'medium', None, ['card', 'paypal'],
     ['NAT 共享 IPv4，无独立 IP', '小内存机型只够跑轻量服务']),
    ('C-Servers', 'JumboDisk', 'medium', None, ['card', 'paypal'],
     ['大容量存储型，NAT 共享 IPv4']),
    ("Gullo's Hosting", None, 'medium', None, ['card', 'paypal'],
     ['NAT 共享 IPv4，无独立 IP']),
    ('NATVPS.net', None, 'medium', None, ['card', 'paypal'],
     ['NAT 共享 IP，需自行做端口转发']),
    ('MrVM', None, 'medium', None, ['card', 'paypal'],
     ['LXC 容器，不能跑 Docker']),
    ('HostHatch', None, 'medium', None, ['card', 'paypal'],
     ['特价机型常年缺货']),
    # ---------- 共享主机（海外） ----------
    ('GreenGeeks', None, 'easy', None, ['card', 'paypal'],
     ['首年低价，续费涨数倍']),
    ('SiteGround', None, 'easy', None, ['card', 'paypal'],
     ['续费价格远高于首年']),
    ('A2 Hosting', None, 'easy', None, ['card', 'paypal'],
     ['续费涨价明显']),
    ('Bluehost', 'Starter', 'easy', None, ['card', 'paypal'],
     ['首年特价，续费翻数倍']),
    ('GoDaddy', None, 'easy', None, ['card', 'paypal'],
     ['续费价格高，且常被搭售增值服务']),
]


def ts_str(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def fill_includes() -> list[tuple]:
    """Derive `productIncludes` for rules that left it as None.

    A catch-all rule (no productIncludes) for a provider that carries special
    metadata would leak onto *every* future product of that provider, so the
    iron rule forbids it. We look the provider up in the live snapshot and use
    its product string — which is only unambiguous when the provider has
    exactly one product on the board.
    """
    import json

    snap = Path(__file__).resolve().parent.parent / '.shots' / 'deals_api.json'
    raw = json.loads(snap.read_text(encoding='utf-8'))
    deals = raw.get('deals', raw) if isinstance(raw, dict) else raw
    by_prov: dict[str, list[str]] = {}
    for d in deals:
        by_prov.setdefault(d['provider'], []).append(d['product'])

    out = []
    for prov, incl, diff, free, pays, limits in R:
        if incl is None:
            prods = by_prov.get(prov)
            if not prods:
                print(f'[!] {prov}: not found in the live snapshot')
                return []
            if len(prods) > 1:
                # fall back to the longest common substring so one rule still
                # covers every product of this provider
                common = ''
                first = prods[0]
                for i in range(len(first)):
                    for j in range(i + 2, len(first) + 1):
                        cand = first[i:j]
                        if len(cand) > len(common) and all(cand in q for q in prods):
                            common = cand
                if len(common) < 2:
                    # leave it as a catch-all; the iron-rule check below will
                    # reject it if it carries special metadata
                    print(f'[i] {prov}: {len(prods)} products, no shared substring — leaving catch-all')
                    common = None
                else:
                    print(f'[i] {prov}: {len(prods)} products, using shared substring {common!r}')
                incl = common
            incl = prods[0]
        out.append((prov, incl, diff, free, pays, limits))
    return out


def render(rows: list[tuple]) -> str:
    out = [BATCH_COMMENT]
    for prov, incl, diff, free, pays, limits in rows:
        out.append('  {')
        out.append(f'    provider: {ts_str(prov)},')
        if incl:
            out.append(f'    productIncludes: {ts_str(incl)},')
        out.append(f"    difficulty: '{diff}',")
        if free:
            out.append('    freeNoCard: true,')
        if pays:
            out.append('    payments: [' + ', '.join(ts_str(p) for p in pays) + '],')
        if limits:
            out.append('    limits: [')
            for l in limits:
                out.append(f'      {ts_str(l)},')
            out.append('    ],')
        out.append('  },')
    return '\n'.join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    rows = fill_includes()
    if not rows:
        return 1
    block = render(rows)

    # sanity: iron rule — special metadata requires an explicit productIncludes
    bad = [r for r in rows if (r[3] or r[2] == 'supplement') and not r[1]]
    if bad:
        print('[!] iron-rule violation (special metadata without productIncludes):')
        for b in bad:
            print('   ', b[0], b[1])
        return 1

    if not args.write:
        print(block)
        print(f'\n# {len(rows)} rules')
        return 0

    text = SRC.read_text(encoding='utf-8')

    # Idempotent: strip any previously spliced block first, so re-running the
    # script never doubles the rules up. The block runs from BATCH_COMMENT to
    # the array terminator — a `]` sitting alone at column 0.
    lines = text.split('\n')
    start = next((i for i, l in enumerate(lines) if BATCH_COMMENT.strip() in l), None)
    if start is not None:
        end = next(i for i in range(start, len(lines)) if lines[i] == ']')
        del lines[start:end]
        text = '\n'.join(lines)

    marker = ']\n\n/** Resolve the curation for a deal.'
    if text.count(marker) != 1:
        print(f'[!] anchor appears {text.count(marker)} times — aborting')
        return 1
    text = text.replace(marker, '  ' + block + '\n]\n\n/** Resolve the curation for a deal.')
    SRC.write_text(text, encoding='utf-8')
    print(f'[done] spliced {len(rows)} rules into {SRC.name}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
