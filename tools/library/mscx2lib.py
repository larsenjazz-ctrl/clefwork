"""OpenScore Lieder (CC0) -> Clefwork library solo melodies: the vocal line of each chosen song.

Reads MuseScore 3 files (.mscx). The voice is the first staff, first voice. Spelling comes from each
note's tonal pitch class (tpc). The line stops before the first change of key or time signature, an
irregular measure after the first, or anything Clefwork doesn't write (32nd notes, tuplets other than
triplets); grace notes are left out. A pickup is filled out with rests at the start.

    python3 mscx2lib.py LIEDER_DIR OUT.json
"""
import json, os, re, sys
import xml.etree.ElementTree as ET
from fractions import Fraction as F

CHOSEN = [5701612, 5153813, 6320420, 5729178, 6180725, 6900961, 5133353, 5004835, 6389103, 4919879, 4985965, 5016466, 4985931,
          5093803, 5025985, 4976777, 4978382, 4987640, 6885211, 6909797, 6917116, 5000397, 5987937, 5004650, 5117906, 5660581,
          5054946, 6177442, 6117412, 6205441, 7111114]
TYPES = {'whole': F(1), 'half': F(1, 2), 'quarter': F(1, 4), 'eighth': F(1, 8), '16th': F(1, 16)}
VAL = {'whole': 'w', 'half': 'h', 'quarter': 'q', 'eighth': 'e', '16th': 's'}
METERS = {(n, 4) for n in (2, 3, 4, 5, 6)} | {(n, 8) for n in range(3, 13)} | {(2, 2), (3, 2)}
SEMIS = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
sys.path.insert(0, os.path.dirname(__file__))
from abc2lib import split_length  # noqa: E402


def spell(pitch, tpc):
    letter = 'FCGDAEB'[(tpc - 13) % 7]
    alt = (tpc - 13) // 7
    octv = (pitch - SEMIS[letter] - alt) // 12 - 1
    return letter + {-2: 'bb', -1: 'b', 0: '', 1: '#', 2: '##'}[alt] + str(octv)


def fill(L):
    parts = split_length(L)
    return ['r' + p for p in parts] if parts else None


def convert(path):
    root = ET.parse(path).getroot()
    score = root.find('Score')
    staff = next(s for s in score.findall('Staff') if s.get('id') == '1')
    fifths, meter, out, notes_seen, tempo = None, None, [], 0, None
    bar_len = None
    for mi, measure in enumerate(staff.findall('Measure')):
        voices = measure.findall('voice')
        if not voices:
            break
        v = voices[0]
        toks, total, trip, stop = [], F(0), False, None
        for el in v:
            tag = el.tag
            if tag == 'KeySig':
                k = int(el.findtext('accidental') or el.findtext('concertKey') or 0)
                if fifths is None:
                    fifths = k
                elif k != fifths:
                    stop = 'key change'
            elif tag == 'TimeSig':
                m = (int(el.findtext('sigN')), int(el.findtext('sigD')))
                if meter is None:
                    meter = m
                    bar_len = F(m[0], m[1])
                elif m != meter:
                    stop = 'meter change'
            elif tag == 'Tempo' and tempo is None:
                try:
                    tempo = round(float(el.findtext('tempo')) * 60)
                except (TypeError, ValueError):
                    pass
            elif tag == 'Tuplet':
                if (el.findtext('actualNotes'), el.findtext('normalNotes')) != ('3', '2'):
                    stop = 'tuplet'
                trip = True
            elif tag == 'endTuplet':
                trip = False
            elif tag in ('Chord', 'Rest'):
                if el.find('acciaccatura') is not None or el.find('appoggiatura') is not None or any(c.tag.startswith('grace') for c in el):
                    continue
                dt = el.findtext('durationType')
                dots = int(el.findtext('dots') or 0)
                if dt == 'measure':
                    d = el.findtext('duration') or f'{meter[0]}/{meter[1]}'
                    a, b = d.split('/')
                    L = F(int(a), int(b))
                    r = fill(L)
                    if r is None:
                        stop = 'rest'
                        break
                    toks += r
                    total += L
                    continue
                if dt not in TYPES or dots > 1:
                    stop = 'value ' + str(dt)
                    break
                L = TYPES[dt] * (F(3, 2) if dots else 1) * (F(2, 3) if trip else 1)
                val = VAL[dt] + ('.' if dots else '') + ('t' if trip else '')
                total += L
                if tag == 'Rest':
                    toks.append('r' + val)
                    continue
                ns = el.findall('Note')
                top = max(ns, key=lambda n: int(n.findtext('pitch')))
                tie = any(sp.get('type') == 'Tie' and sp.find('next') is not None for sp in top.findall('Spanner'))
                toks.append(spell(int(top.findtext('pitch')), int(top.findtext('tpc'))) + val + ('~' if tie else ''))
                notes_seen += 1
            if stop:
                break
        if stop or fifths is None or meter is None:
            break
        if total != bar_len:
            if mi == 0 and total < bar_len:
                r = fill(bar_len - total)
                if r is None:
                    break
                toks = r + toks
            else:
                break
        out.append(' '.join(toks))
    # Cut a trailing tie into nothing, and leading measures of rest (the piano's introduction).
    while out and all(t.startswith('r') for t in out[0].split()):
        out.pop(0)
    if out and out[-1].endswith('~'):
        out[-1] = out[-1][:-1]
    return fifths, meter, out, tempo


MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
MINOR = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#']


def mode_of(fifths, ms):
    # Minor when the line uses the relative minor's raised seventh often, or ends on its tonic.
    tonic = MINOR[fifths + 7]
    lead = 'FCGDAEB'[(('FCGDAEB'.index(tonic[0]) + 5) % 7)]   # the letter a step below the tonic
    notes = re.findall(r'(?:^|\s)([A-G](?:bb|b|##|#)?)-?\d', ' '.join(ms))
    letters = 'CDEFGAB'
    lead = letters[(letters.index(tonic[0]) + 6) % 7]
    raised = sum(1 for n in notes if n[0] == lead and n != _key_spelling(lead, fifths))
    last = notes[-1] if notes else ''
    return 'minor' if raised >= 2 or last == tonic else 'major'


def _key_spelling(letter, fifths):
    order = 'FCGDAEB'
    if fifths > 0 and letter in order[:fifths]:
        return letter + '#'
    if fifths < 0 and letter in order[::-1][:-fifths]:
        return letter + 'b'
    return letter


def main(src, outjson):
    base = next(os.path.join(src, d) for d in os.listdir(src) if d.startswith('OpenScore'))
    rows = {}
    for ln in open(os.path.join(base, 'data', 'scores.tsv'), encoding='utf-8').read().split('\n')[1:]:
        c = ln.split('\t')
        if len(c) > 1:
            rows[int(c[0])] = c[1]
    pieces = []
    for sid in CHOSEN:
        rel = rows.get(sid)
        if not rel:
            print('missing', sid)
            continue
        f = os.path.join(base, 'scores', rel, f'lc{sid}.mscx')
        if not os.path.exists(f):
            print('no file', rel)
            continue
        fifths, meter, ms, tempo = convert(f)
        if not meter or tuple(meter) not in METERS or len(ms) < 8:
            print('skipped', rel, meter, len(ms))
            continue
        comp, *rest = rel.split('/')
        last, first = (comp.split(',_') + [''])[:2]
        by = (first.replace('_', ' ') + ' ' + last.replace('_', ' ')).strip()
        title = re.sub(r'^\d+_', '', rest[-1]).replace('_', ' ')
        group = rest[0].replace('_', ' ') if len(rest) > 1 and rest[0] != '_' else ''
        pieces.append({
            'id': f'lied-{sid}', 'title': title + (f' ({group})' if group else ''), 'by': by, 'year': '', 'style': 'Art song (voice)', 'kind': 'melody',
            'source': 'OpenScore Lieder Corpus (CC0), vocal line', 'license': 'CC0 (public domain)',
            'key': {'fifths': fifths, 'mode': mode_of(fifths, ms)}, 'meter': {'n': meter[0], 'd': meter[1]}, 'tempo': max(40, min(160, tempo or 80)),
            'parts': [{'name': 'Voice', 'clef': 'treble', 'm': ms}],
        })
        print(len(pieces), title[:40], by, f'{len(ms)} measures', meter)
    json.dump(pieces, open(outjson, 'w'), indent=0, ensure_ascii=False)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
