"""Hymn tunes as solo melodies: each hymn's soprano line, once per tune (the same tune set to two
texts is kept once), named by its tune.

    python3 tunes.py HYMNS.json OUT.json
"""
import json, re, sys

hymns = json.load(open(sys.argv[1]))
seen, out = set(), []
for h in hymns:
    sop = h['parts'][0]
    key = ' | '.join(sop['m'])
    if key in seen:
        continue
    seen.add(key)
    m = re.match(r'^(.*?)\s*\(([^)]*)\)$', h['title'])
    text, tune = (m.group(1), m.group(2)) if m else (h['title'], '')
    out.append({
        'id': 'tune-' + h['id'][5:], 'title': f'{tune} (“{text}”)' if tune else h['title'], 'by': h['by'], 'year': h.get('year', ''),
        'style': 'Hymn tune', 'kind': 'melody', 'source': h['source'] + ', soprano line', 'license': h['license'],
        'key': h['key'], 'meter': h['meter'], 'tempo': h['tempo'], 'parts': [{'name': 'Melody', 'clef': 'treble', 'm': sop['m']}],
    })
json.dump(out, open(sys.argv[2], 'w'), indent=0, ensure_ascii=False)
print(len(out), 'tunes from', len(hymns), 'hymns')
