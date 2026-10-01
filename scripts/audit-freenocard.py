#!/usr/bin/env python3
"""Audit rules in deal-curation.ts that carry freeNoCard / payments metadata.

Flags the contradiction `freeNoCard: true` + non-empty `payments`, which makes a
card claim "完全免费" while still rendering payment badges.
"""
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'deal-curation.ts'
text = SRC.read_text(encoding='utf-8')

# isolate the rules array
start = text.index('const rules')
start = text.index('[', start)
end = text.index('\n]', start)
body = text[start:end]

# split top-level rule objects: lines beginning with exactly two spaces + "{"
blocks = re.split(r'\n  \{', body)
rows = []
for b in blocks[1:]:
    prov = re.search(r"provider:\s*'([^']*)'", b)
    incl = re.search(r"productIncludes:\s*'([^']*)'", b)
    free = 'freeNoCard: true' in b
    pay = re.search(r'payments:\s*\[([^\]]*)\]', b)
    pays = re.findall(r"'([^']+)'", pay.group(1)) if pay else []
    rows.append({
        'provider': prov.group(1) if prov else '?',
        'includes': incl.group(1) if incl else '(ALL)',
        'free': free,
        'payments': pays,
    })

free_rows = [r for r in rows if r['free']]
print(f'total rules          : {len(rows)}')
print(f'freeNoCard: true     : {len(free_rows)}')
print()
print('--- freeNoCard + payments (badge contradiction) ---')
bad = [r for r in free_rows if r['payments']]
for r in bad:
    print(f"  {r['provider']:22} | {r['includes']:24} | {','.join(r['payments'])}")
print(f'  -> {len(bad)} rule(s)')
print()
print('--- freeNoCard, no payments (clean) ---')
for r in free_rows:
    if not r['payments']:
        print(f"  {r['provider']:22} | {r['includes']}")
