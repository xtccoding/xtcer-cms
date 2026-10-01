#!/usr/bin/env python3
"""Generate the 「增强层」 rules: 性能机型 (perf) / 优势 (pros) / 大厂同规格对比 (compare).

Why a separate table instead of editing `rules`:
rules are first-match-wins per provider, so bolting a second rule onto a provider
risks silently shadowing its existing difficulty / limits. The enrichment layer
is merged *after* the base rule in `resolveCuration`, so it can only add.

All `compare` numbers come from the verified 大厂 price table
(`drafts/_bigcloud_reference.json`), captured 2026-10. Do not invent prices here —
a wrong benchmark is worse than no benchmark.

Run:  python scripts/gen-curation-enrich.py [--write]
"""
from __future__ import annotations

import argparse
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'deal-curation.ts'
ANCHOR = 'const enrichments: EnrichRule[] = []'
BLOCK_START = '  // >>> ENRICH-BLOCK-START'
BLOCK_END = '  // <<< ENRICH-BLOCK-END'

COMPARE_NOTE = '2026-10 核实'

# ---- 大厂基准（全部来自 _bigcloud_reference.json 的已核实行）----
TC_LH_2C2G = {'vendor': '腾讯云轻量', 'config': '锐驰型 2核2G · 200Mbps', 'price': '¥45/月'}
TC_LH_2C4G = {'vendor': '腾讯云轻量', 'config': '锐驰型 2核4G · 200Mbps', 'price': '¥65/月'}
TC_LH_HK = {'vendor': '腾讯云轻量', 'config': '香港 2核2G · 200Mbps', 'price': '¥55/月'}
TC_LH_ENTRY = {'vendor': '腾讯云轻量', 'config': '入门型 2核2G · 2Mbps', 'price': '¥35/月'}
AWS_T3_MED = {'vendor': 'AWS', 'config': 'EC2 t3.medium · 2核4G', 'price': '¥204/月'}
AWS_T4G_MED = {'vendor': 'AWS', 'config': 'EC2 t4g.medium · 2核4G', 'price': '¥165/月'}
AZ_B1MS = {'vendor': 'Azure', 'config': 'B1ms · 1核2G', 'price': '¥102/月'}
OSS = {'vendor': '阿里云 OSS', 'config': '标准存储', 'price': '¥0.12/GB/月'}
COS = {'vendor': '腾讯云 COS', 'config': '标准存储', 'price': '¥0.118/GB/月'}
S3 = {'vendor': 'AWS S3', 'config': 'Standard', 'price': '$0.023/GB/月'}
ALI_CDN = {'vendor': '阿里云 CDN', 'config': '按流量', 'price': '¥0.24/GB'}
TC_CDN = {'vendor': '腾讯云 CDN', 'config': '按流量', 'price': '¥0.21/GB'}

# (provider, productIncludes|None, perf, pros, compare)
E = [
    # ---------- 国内大厂促销：跟自家刊例价对比最有说服力 ----------
    ('腾讯云', '轻量应用服务器',
     '锐驰型同款 200Mbps 峰值带宽 + 无限流量',
     ['年付折算每月不到 ¥9', '与刊例价同规格，省下约 87%'],
     [TC_LH_2C4G, AWS_T3_MED]),
    ('阿里云', '轻量应用服务器',
     'ESSD 云盘 + 200Mbps 峰值带宽',
     ['年付 ¥38，是全站最便宜的 2核2G 大厂机', '与腾讯云轻量同档可直接横向比'],
     [TC_LH_2C2G, AWS_T4G_MED]),
    ('阿里云', 'ECS经济型e',
     '独享型 vCPU，非突发共享',
     ['ECS 正统产品线，不是轻量阉割版', '促销期外仍可原价续费'],
     [TC_LH_2C2G, AWS_T3_MED]),
    ('华为云', 'Flexus',
     '200GB 月流量包，带宽按流量计费',
     ['同规格比腾讯云轻量便宜约 ¥3/月'],
     [TC_LH_2C2G]),
    ('火山引擎', '云服务器',
     'AMD 独享 vCPU（非共享型）',
     ['2核8G 才 ¥199/年，内存是同价位两倍', '字节自营机房，国内直连'],
     [TC_LH_2C4G, AWS_T3_MED]),
    ('慈云数据', '香港特惠',
     '香港 CN2 线路，大陆回程优化',
     ['免备案，¥16/月就能拿到 2核2G 香港机'],
     [TC_LH_HK]),
    ('蓝队云', '适配型',
     '国内机房独立 IP',
     ['年付 ¥300 拿到 2核2G + 独立 IP', '适合需要备案的国内站'],
     [TC_LH_2C2G]),
    ('雨云', '云服务器',
     '国内高防线路',
     ['年付折算每月 ¥15 出头，带基础防护'],
     [TC_LH_2C2G]),

    # ---------- 海外便宜 VPS：跟 AWS / Azure 对比 ----------
    ('RackNerd', '768MB KVM',
     'SSD 缓存 + 1Gbps 端口',
     ['年付 $10.18，是全网最低价的 KVM 之一', '机房可选最多，换 IP 方便'],
     [AWS_T4G_MED, AZ_B1MS]),
    ('RackNerd', '2核2G KVM',
     'SSD 缓存 + 1Gbps 端口',
     ['2核2G 年付 $17.66，单月不到 ¥11', '同价位少见的双核配置'],
     [AWS_T4G_MED]),
    ('CloudCone', '512MB KVM',
     'RAID10 存储，支持按小时计费',
     ['年付 $9.99 且可随开随删', '老牌商家，退款政策明确'],
     [AZ_B1MS]),
    ('CloudCone', 'SC2 弹性云',
     'RAID10 存储 + 按小时计费',
     ['按小时计费，跑完就删最省钱'],
     [AZ_B1MS]),
    ('Hetzner', 'CX23',
     'NVMe SSD + 20TB 流量（欧洲机房）',
     ['同价位配置与网络都是欧洲第一档', '按小时计费，随时退'],
     [AWS_T4G_MED, AZ_B1MS]),
    ('OVHcloud', 'VPS-1',
     'NVMe SSD + 不限流量 @400Mbps',
     ['4核8G 只要 $4.20/月，配置是同价位两倍'],
     [AWS_T3_MED, TC_LH_2C4G]),
    ('Contabo', 'Cloud VPS',
     'NVMe SSD，内存给得极猛',
     ['同价位内存通常是别人的 2–4 倍', '德国机房，欧洲访问快'],
     [AWS_T3_MED, TC_LH_2C4G]),
    ('HostHatch', '入门 NVMe',
     'AMD EPYC + 纯 NVMe 存储',
     ['EPYC 平台单核性能强', '大流量套餐多'],
     [AWS_T4G_MED]),
    ('Akamai Linode', 'Nanode',
     '企业级网络，全球 20+ 机房',
     ['$5/月 是老牌稳定档的基准价'],
     [AWS_T4G_MED, AZ_B1MS]),
    ('Vultr', 'Cloud Compute',
     '全 SSD + 全球 30+ 机房',
     ['$2.50/月 是海外大厂的最低门槛'],
     [AZ_B1MS]),
    ('UpCloud', 'Developer',
     '最高 1000Mbps 端口，NVMe 存储',
     ['同价位端口带宽给得最宽'],
     [AZ_B1MS]),
    ('BuyVM', 'Slice',
     '不限流量 + 可加购 Block Storage',
     ['$3.50/月 给 1G 内存且不限流量', '老牌小商家，口碑稳'],
     [AWS_T4G_MED]),
    ('DMIT', 'T1',
     '三网优化线路，1Gbps 端口',
     ['线路质量是它的核心卖点，不是拼配置'],
     [AWS_T4G_MED]),
    ('HostDare', 'CN2 GIA',
     'CN2 GIA 三网直连线路',
     ['CN2 GIA 里单价最低的一档', '适合做国内访问的落地机'],
     [TC_LH_2C2G]),
    ('狗云', '弹性云',
     'KVM 全虚拟化 + 按小时计费',
     ['按小时计费，不用了直接销毁', '¥7.5/月 是全站起步价最低的付费机'],
     [TC_LH_ENTRY]),
    ('咸鱼云', '低价 CN2 GIA',
     'CN2 GIA 线路',
     ['¥15/月 是 CN2 GIA 的价格下限'],
     [TC_LH_ENTRY]),
    ('搬瓦工', 'CN2 GIA-E 年付',
     '三网回程 CN2 GIA，晚高峰不绕路',
     ['CN2 GIA 线路里最知名的一家', '老牌商家，跑路风险低'],
     [TC_LH_2C2G]),
    ('搬瓦工', 'CN2 GIA-E 高端款',
     None,
     ['贵在线路质量：晚高峰三网都不掉速', '比 AWS 同规格仍便宜，但纯比配置不划算'],
     [AWS_T3_MED, TC_LH_2C4G]),
    ('GigsGigsCloud', '特价 KVM',
     '香港 / 美国多线路可选',
     ['$5/月起，线路选项丰富'],
     [TC_LH_ENTRY]),
    ('MoeCloud', '韩国 CN2',
     '韩国原生 IP + CN2 回程',
     ['韩国原生 IP 在小商家圈子里少见', '适合做韩区业务'],
     [TC_LH_ENTRY]),
    ('UFOVPS', '多线路',
     None,
     ['国内访问稳定性好'],
     [TC_LH_ENTRY]),
    ('椰草云', '香港轻量',
     'AMD 平台 + 380GB 流量 @100Mbps',
     ['港区原生 IP，免备案'],
     [TC_LH_HK]),
    ('HostKVM', '香港 CN2',
     '移动 CMI 直连，延迟可低到 35ms',
     ['移动宽带用户延迟表现突出'],
     [TC_LH_HK]),
    ('CUBECLOUD', 'CN2 GIA',
     'CN2 GIA + NVMe 存储',
     ['CN2 GIA 里少见的 NVMe 配置'],
     [TC_LH_ENTRY]),
    ('V.PS', '三网优化',
     '1Gbps–2.5Gbps 独享端口',
     ['独享端口，不跟别人抢带宽'],
     [TC_LH_2C2G]),
    ('GreenCloud', '特价 KVM',
     'KVM 全虚拟化，多机房可选',
     ['$15/年起，年付门槛低'],
     [AZ_B1MS]),
    ('VirMach', '特价 KVM',
     'KVM 全虚拟化',
     ['常年有低于 $3/月 的特价档'],
     [AZ_B1MS]),
    ('EthernetServers', '特价 OpenVZ',
     '含 5Gbps DDoS 防护',
     ['带 DDoS 防护的低价机不多见'],
     [AZ_B1MS]),
    ('DediRock', '入门 KVM',
     'KVM 全虚拟化 + SSD',
     ['$6.99/年 属于年付最低价一档'],
     [AZ_B1MS]),

    # ---------- NAT / 小内存 ----------
    ('ByteVirt', '东京 NAT',
     'KVM 全虚拟化 + NVMe',
     ['$8.80/年，东京机房的最低门槛', 'NAT 机免去独立 IP 成本'],
     [TC_LH_ENTRY]),
    ('ByteVirt', '香港 NAT',
     'KVM 全虚拟化 + NVMe',
     ['这一档是全系最便宜的'],
     [TC_LH_HK]),
    ('NATVPS.net', 'NAT512',
     '750GB 月流量 + IPv6 /80',
     ['$7.5/年，流量给得比同价位多'],
     [TC_LH_ENTRY]),
    ("Gullo's Hosting", 'NAT',
     None,
     ['$3.5/年 是全站最低价', '端口数量多，能对外映射多个服务'],
     [TC_LH_ENTRY]),
    ('C-Servers', 'NanoVPS-II',
     'Ryzen 9 平台 + NVMe，200Mbps 不限流量',
     ['Ryzen 9 平台在小内存机里很少见'],
     [TC_LH_ENTRY]),

    # ---------- 免费额度：跟付费基准比 ----------
    ('Oracle Cloud', 'Always Free ARM',
     'Ampere A1（ARM）· 最高 4 OCPU / 24GB',
     ['唯一能长期白嫖到 4核24G 的云', '10TB/月 出网，比多数付费机还多'],
     [AWS_T3_MED, TC_LH_2C4G]),
    ('Google Cloud', 'e2-micro',
     '共享 vCPU 的突发型实例',
     ['永久免费，不限期'],
     [AZ_B1MS]),
    ('AWS', 'Free Tier',
     '新账户 $200 试用金',
     ['额度可用于 EC2 / S3 / RDS 全线产品'],
     [AZ_B1MS]),
    ('Azure', '免费',
     'B1S 750 小时/月（12 个月）',
     ['12 个月内相当于一台免费 1核1G 常开'],
     [AZ_B1MS]),

    # ---------- 存储 / CDN：对比每 GB 单价 ----------
    ('Cloudflare', 'R2 对象存储',
     '兼容 S3 API，无出网流量费',
     ['出网完全免费，是相对 S3 的最大优势', '10GB 免费额度永久有效'],
     [OSS, S3]),
    ('Backblaze', 'B2 对象存储',
     '兼容 S3 API，出网免费额度大',
     ['每 GB 单价是主流对象存储里最低的', '出网免费额度可达存储量的 3 倍'],
     [OSS, S3]),
    ('七牛云', 'Kodo',
     None,
     ['国内访问速度优于海外对象存储'],
     [OSS, COS]),
    ('Tigris', '免费对象存储',
     '兼容 S3 API 的全球分布式存储',
     ['5GB 免费额度，无出网费'],
     [OSS, S3]),
    ('Gcore', '免费 CDN',
     '全球边缘节点 + 免费额度',
     ['免费额度按流量给，适合小站起步'],
     [ALI_CDN, TC_CDN]),
    ('Bunny.net', 'CDN',
     '全球边缘节点，按流量阶梯计价',
     ['起步单价低于国内云 CDN'],
     [ALI_CDN, TC_CDN]),
    ('又拍云', 'CDN',
     '国内节点 + 赠送额度按月发放',
     ['国内 CDN 里少数按月送额度的'],
     [ALI_CDN, TC_CDN]),
    ('多吉云', 'CDN',
     '国内节点 + 按月赠送额度',
     ['赠送额度按月刷新，长期可用'],
     [ALI_CDN, TC_CDN]),
]


def ts_str(s: str) -> str:
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def render() -> str:
    out = []
    for prov, incl, perf, pros, compare in E:
        out.append('  {')
        out.append(f'    provider: {ts_str(prov)},')
        if incl:
            out.append(f'    productIncludes: {ts_str(incl)},')
        if perf:
            out.append(f'    perf: {ts_str(perf)},')
        if pros:
            out.append('    pros: [')
            for p in pros:
                out.append(f'      {ts_str(p)},')
            out.append('    ],')
        if compare:
            out.append('    compare: [')
            for c in compare:
                out.append('      { ' + ', '.join(f'{k}: {ts_str(v)}' for k, v in c.items()) + ' },')
            out.append('    ],')
            out.append(f'    compareNote: {ts_str(COMPARE_NOTE)},')
        out.append('  },')
    return '\n'.join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    # iron rule: enrichment carries special metadata, so every rule needs productIncludes
    bad = [e for e in E if not e[1] and (e[3] or e[4])]
    if bad:
        print('[!] iron-rule violation (pros/compare without productIncludes):')
        for b in bad:
            print('   ', b[0])
        return 1

    block = render()
    if not args.write:
        print(block)
        print(f'\n# {len(E)} enrichment rules')
        return 0

    text = SRC.read_text(encoding='utf-8')

    # Preferred path: replace the sentinel-delimited block in place (idempotent).
    if text.count(BLOCK_START) == 1 and text.count(BLOCK_END) == 1:
        head, rest = text.split(BLOCK_START, 1)
        _old, tail = rest.split(BLOCK_END, 1)
        text = f'{head}{BLOCK_START}\n{block}\n{BLOCK_END}{tail}'
        SRC.write_text(text, encoding='utf-8')
        print(f'[done] replaced sentinel block with {len(E)} enrichment rules')
        return 0

    # First-time path: the empty-array anchor is still present.
    if text.count(ANCHOR) == 1:
        wrapped = f'const enrichments: EnrichRule[] = [\n{BLOCK_START}\n{block}\n{BLOCK_END}\n]'
        text = text.replace(ANCHOR, wrapped, 1)
        SRC.write_text(text, encoding='utf-8')
        print(f'[done] wrote {len(E)} enrichment rules (first time)')
        return 0

    print('[!] neither the sentinel block nor the empty-array anchor was found — aborting')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
