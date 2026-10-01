#!/usr/bin/env python3
"""Generate curation rules for the 「大厂标准价 · 对比参考」cards.

These cards are benchmarks, not deals, so every rule carries `reference: true`
and gets `difficulty: 'easy'` (they never reach a difficulty section anyway).

Why this script exists separately from `gen-curation-batch.py`:
the reference rules must be matched **before** the provider's other rules.
e.g. 腾讯云 has a rule `productIncludes: '轻量应用服务器'`, and the reference card
is named `轻量应用服务器 锐驰型 2核2G · 标准价` — which contains that substring.
First-match-wins would hand it the wrong curation. So this script **prepends**
the block to the top of the rules array.

`reference: true` is "special metadata", so per the iron rule every rule also
carries `productIncludes: '标准价'` — that is what keeps it from leaking onto
the provider's normal deals.

Run:  python scripts/gen-curation-reference.py [--write]
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src' / 'data' / 'deal-curation.ts'
CARDS = ROOT / 'drafts' / '_bigcloud_cards.json'

BATCH_START = '  // >>> REFERENCE-BLOCK-START'
BATCH_END = '  // <<< REFERENCE-BLOCK-END'

# provider -> limits。参考卡的限制是「这条基准线的适用条件」，
# 不是「雷点」—— 目的是让读者知道这个价格对应什么规格、不含什么。
LIMITS: dict[str, list[str]] = {
    'AWS': ['按需价，不含出网流量费', '不含 EBS 存储与快照'],
    'Microsoft Azure': ['即用即付价，不含出网流量费', '不含磁盘存储'],
    'Backblaze': ['出网免费额度 3 倍于存储量，超出按量计费'],
    'Supabase': ['超出计算额度按 $0.01344/小时 计费'],
    'Namecheap': ['首年低价为促销，续费按此标准价'],
    '阿里云': ['刊例价，活动期通常更低', '国内节点需备案'],
    '腾讯云': ['刊例价，半年起有 88 折', '国内节点需备案'],
    '华为云': ['刊例价，活动期通常更低', '国内节点需备案'],
    'Cloudflare': ['免费计划不含高级 WAF 与图片优化'],
}


def ts_str(s: str) -> str:
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def render(cards: list[dict]) -> str:
    out = [BATCH_START, '  // 大厂标准价参考卡（reference: true）—— 必须排在其它规则之前，否则会被同厂商的普通规则抢先匹配']
    seen: set[str] = set()
    for c in cards:
        prov = c['provider']
        if prov in seen:
            continue
        seen.add(prov)
        out.append('  {')
        out.append(f'    provider: {ts_str(prov)},')
        out.append("    productIncludes: '标准价',")
        out.append("    difficulty: 'easy',")
        out.append('    reference: true,')
        lims = LIMITS.get(prov)
        if lims:
            out.append('    limits: [')
            for l in lims:
                out.append(f'      {ts_str(l)},')
            out.append('    ],')
        out.append('  },')
    out.append(BATCH_END)
    return '\n'.join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    cards = json.loads(CARDS.read_text(encoding='utf-8'))['deals']
    bad = [c for c in cards if c.get('type') != 'reference']
    if bad:
        print(f'[!] {len(bad)} card(s) are not type=reference — aborting')
        return 1
    if not all('标准价' in c['product'] for c in cards):
        print('[!] every reference product name must contain 「标准价」 — aborting')
        return 1

    block = render(cards)

    if not args.write:
        print(block)
        print(f'\n# {len({c["provider"] for c in cards})} rules for {len(cards)} cards')
        return 0

    text = SRC.read_text(encoding='utf-8')

    # Idempotent: drop any previously spliced block.
    #
    # NOTE: the block sits at the TOP of the rules array, so we cannot strip
    # "up to the next bare `]`" — that would swallow every rule in the array
    # down to the terminator. (That bug wiped 2200 lines once.) Use explicit
    # START/END sentinels instead.
    lines = text.split('\n')
    start = next((i for i, l in enumerate(lines) if l.strip() == BATCH_START.strip()), None)
    if start is not None:
        end = next(
            (i for i in range(start, len(lines)) if lines[i].strip() == BATCH_END.strip()),
            None,
        )
        if end is None:
            print('[!] found START but no END sentinel — aborting to avoid data loss')
            return 1
        del lines[start:end + 1]
        text = '\n'.join(lines)

    anchor = 'const rules: Rule[] = [\n'
    if text.count(anchor) != 1:
        print(f'[!] anchor appears {text.count(anchor)} times — aborting')
        return 1

    # Safety net: the rules array must still be intact before we touch it.
    before_rules = text.count('\n  {')
    if before_rules < 50:
        print(f'[!] only {before_rules} rules present — refusing to splice')
        return 1

    text = text.replace(anchor, anchor + block + '\n', 1)
    SRC.write_text(text, encoding='utf-8')
    after_rules = text.count('\n  {')
    print(f'[done] prepended {len({c["provider"] for c in cards})} reference rules '
          f'({before_rules} -> {after_rules} rule objects)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
