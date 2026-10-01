"""Mutopia piano pieces: their MIDI files -> notes for the library, so the piano scores can be heard.

LilyPond writes each staff as a MIDI track with exact note lengths, so onsets and lengths fall on
Clefwork's grid (twelve to a quarter note); grace notes and ornaments, which don't, are left out. Each staff's notes are split into voices — notes that
start and end together are a chord — and each voice becomes a part. Spelling is inferred: the key
signature's notes as written, any other note spelled closest to the key on the line of fifths. A
pickup (LilyPond's \\partial) is read from the .ly source and filled out with rests. The notes stop
before the first change of meter or key, or the first measure Clefwork can't write.

    python3 midi2lib.py PIANO.json LISTING.json WORK_DIR   (adds parts to the pieces in PIANO.json)
"""
import json, os, re, struct, sys, time, urllib.request
from fractions import Fraction as F
sys.path.insert(0, os.path.dirname(__file__))
from abc2lib import split_length, value_of, METERS  # noqa: E402

LETTERS = 'CDEFGAB'
SEMIS = [0, 2, 4, 5, 7, 9, 11]
FIFTHS_OF = {'F': -1, 'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5}


def read_midi(data):
    assert data[:4] == b'MThd'
    fmt, ntrk, div = struct.unpack('>HHH', data[8:14])
    pos, tracks, metas = 14, [], []
    for _ in range(ntrk):
        assert data[pos:pos + 4] == b'MTrk'
        n = struct.unpack('>I', data[pos + 4:pos + 8])[0]
        tr, pos = data[pos + 8:pos + 8 + n], pos + 8 + n
        t, i, status, on, notes = 0, 0, 0, {}, []

        def vlq():
            nonlocal i
            v = 0
            while True:
                b = tr[i]
                i += 1
                v = (v << 7) | (b & 0x7f)
                if not b & 0x80:
                    return v
        while i < len(tr):
            t += vlq()
            b = tr[i]
            if b & 0x80:
                status = b
                i += 1
            if status == 0xff:
                kind = tr[i]
                i += 1
                ln = vlq()
                body = tr[i:i + ln]
                i += ln
                metas.append((t, kind, body))
            elif status in (0xf0, 0xf7):
                ln = vlq()
                i += ln
            else:
                hi = status & 0xf0
                a = tr[i]
                bb = tr[i + 1] if hi not in (0xc0, 0xd0) else 0
                i += 1 if hi in (0xc0, 0xd0) else 2
                if hi == 0x90 and bb > 0:
                    on.setdefault(a, []).append(t)
                elif hi == 0x80 or (hi == 0x90 and bb == 0):
                    if on.get(a):
                        notes.append((on[a].pop(0), t, a))
        if notes:
            tracks.append(sorted(notes))
    return div, tracks, metas


def spell(pc, fifths, minor):
    """A pitch class -> (letter, alteration): in the key as written, otherwise nearest the key."""
    center = fifths + (3 if minor else 1)
    best = None
    for li, L in enumerate(LETTERS):
        alt = (pc - SEMIS[li] + 6) % 12 - 6
        if abs(alt) > 2:
            continue
        pos = FIFTHS_OF[L] + 7 * alt
        d = abs(pos - center)
        # Notes of the key signature (and minor's raised 6th and 7th) are always written that way.
        in_key = -1 <= pos - fifths <= 5 or (minor and pos - fifths in (6, 7))
        score = (0 if in_key else 1, d, -alt)
        if best is None or score < best[0]:
            best = (score, L, alt)
    return best[1], best[2]


def name(midi_n, fifths, minor):
    L, alt = spell(midi_n % 12, fifths, minor)
    octv = (midi_n - SEMIS[LETTERS.index(L)] - alt) // 12 - 1
    return L + {-2: 'bb', -1: 'b', 0: '', 1: '#', 2: '##'}[alt] + str(octv)


def units_value(u):
    """A length in units (12 a quarter) -> Clefwork values (tied) or None."""
    L = F(u, 48)
    v = value_of(L, False) or value_of(L, True)
    if v:
        return [v]
    return split_length(L)


def partial_units(ly):
    m = re.search(r'\\partial\s+(\d+)(\.*)(?:\s*\*\s*(\d+)(?:/(\d+))?)?', ly)
    if not m:
        return 0
    L = F(1, int(m.group(1)))
    if m.group(2):
        L = L * (2 - F(1, 2 ** len(m.group(2))))
    if m.group(3):
        L = L * int(m.group(3)) / int(m.group(4) or 1)
    return int(L * 48)


def convert(midi, ly):
    div, tracks, metas = read_midi(midi)
    ts = sorted((t, b) for t, k, b in metas if k == 0x58)
    ks = sorted((t, b) for t, k, b in metas if k == 0x59)
    if not ts:
        return None, 'no time signature'
    n, d = ts[0][1][0], 2 ** ts[0][1][1]
    if (n, d) not in METERS:
        return None, f'meter {n}/{d}'
    fifths, minor = (struct.unpack('b', ks[0][1][:1])[0], ks[0][1][1] == 1) if ks else (0, False)
    unit = div / 12
    bar = n * 48 // d
    pick = partial_units(ly)
    shift = (bar - pick) % bar if pick else 0
    # Where the notes must stop: a change of meter or key.
    changes = [t for t, b in ts[1:] if b[:2] != ts[0][1][:2]] + [t for t, b in ks[1:] if b[:2] != ks[0][1][:2]]
    stop = min(changes) if changes else None
    parts, bars_ok = [], None
    for ti, tr in enumerate(tracks):
        q = []
        for s, e, p in tr:
            if stop is not None and s >= stop:
                continue
            # Grace notes and ornaments fall between the grid's lines: a note that starts off the grid is
            # left out, and an end that's off is rounded (a staccato's shortened length, say).
            us, ue = s / unit, e / unit
            if abs(us - round(us)) > 0.15:
                continue
            us, ue = round(us), max(round(us) + 1, round(ue))
            q.append((us + shift, ue + shift, p))
        if not q:
            continue
        # Chords: notes starting and ending together. Voices: each chord to the first voice that's free.
        chords = {}
        for s, e, p in q:
            chords.setdefault((s, e), []).append(p)
        voices = []
        for (s, e), ps in sorted(chords.items()):
            for v in voices:
                if v[-1][1] <= s:
                    v.append((s, e, sorted(ps)))
                    break
            else:
                if len(voices) >= 3:
                    return None, 'too many voices'
                voices.append([(s, e, sorted(ps))])
        end = max(e for v in voices for _, e, _ in v)
        nbars = -(-end // bar)
        for vi, v in enumerate(voices):
            ms, ok = [], 0
            for b in range(nbars):
                b0, b1, toks, t = b * bar, (b + 1) * bar, [], b * bar
                bad = False
                for s, e, ps in v:
                    if e <= b0 or s >= b1:
                        continue
                    s2, e2 = max(s, b0), min(e, b1)
                    if s2 > t:
                        r = units_value(s2 - t)
                        if r is None:
                            bad = True
                            break
                        toks += ['r' + x for x in r]
                    vals = units_value(e2 - s2)
                    if vals is None:
                        bad = True
                        break
                    nm = '+'.join(name(p, fifths, minor) for p in ps)
                    for j, x in enumerate(vals):
                        toks.append(nm + x + ('~' if j < len(vals) - 1 or e > b1 else ''))
                    t = e2
                if not bad and t < b1:
                    r = units_value(b1 - t)
                    bad = r is None
                    if r:
                        toks += ['r' + x for x in r]
                if bad:
                    break
                ms.append(' '.join(toks))
                ok += 1
            bars_ok = ok if bars_ok is None else min(bars_ok, ok)
            parts.append({'name': ('Right hand' if ti == 0 else 'Left hand') + (f', voice {vi + 1}' if len(voices) > 1 else ''),
                          'clef': 'treble' if ti == 0 else 'bass', 'm': ms})
    if not parts or not bars_ok or bars_ok < 4:
        return None, 'too few measures'
    for p in parts:
        p['m'] = p['m'][:bars_ok]
        if p['m'] and p['m'][-1].endswith('~'):
            p['m'][-1] = p['m'][-1][:-1]
    # Parts that are only rests (a voice used for a few notes later on) are left out.
    parts = [p for p in parts if any(not tok.startswith('r') for m in p['m'] for tok in m.split())]
    tempo = next((60000000 // struct.unpack('>I', b'\0' + b[:3])[0] for t, k, b in sorted(metas) if k == 0x51), 96)
    return {'key': {'fifths': fifths, 'mode': 'minor' if minor else 'major'}, 'meter': {'n': n, 'd': d}, 'tempo': int(max(40, min(200, tempo))), 'parts': parts}, None


def main(piano_json, listing, work):
    pieces = json.load(open(piano_json))
    P = json.load(open(listing))
    links = {}
    for p in P:
        info = next((l for l in p['links'] if 'piece-info.cgi?id=' in l), '')
        m = re.search(r'id=(\d+)', info)
        if m:
            links['mutopia-' + m.group(1)] = p['links']
    os.makedirs(work, exist_ok=True)
    done = 0
    for pc in pieces:
        L = links.get(pc['id'], [])
        mid = next((l for l in L if l.endswith('.mid')), None)
        ly = next((l for l in L if l.endswith('.ly')), None)
        if not mid:
            print('no MIDI for', pc['title'])
            continue
        got = {}
        for url, ext in ((mid, '.mid'), (ly, '.ly')):
            if not url:
                continue
            f = os.path.join(work, pc['id'] + ext)
            if not os.path.exists(f):
                req = urllib.request.Request(url, headers={'User-Agent': 'Clefwork library builder (music education)'})
                open(f, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
                time.sleep(1.0)
            got[ext] = open(f, 'rb').read()
        res, why = convert(got['.mid'], got.get('.ly', b'').decode('utf-8', 'replace'))
        if res:
            pc.update(res)
            pc['source'] += '; notes from its MIDI file, spelling inferred'
            done += 1
            print(f'{done:3} {pc["title"][:44]:44} {len(res["parts"])} parts, {len(res["parts"][0]["m"])} measures, {res["meter"]["n"]}/{res["meter"]["d"]}')
        else:
            print('    -', pc['title'][:44], '—', why)
    json.dump(pieces, open(piano_json, 'w'), indent=0, ensure_ascii=False)
    print(done, 'of', len(pieces), 'piano pieces can be heard')


if __name__ == '__main__':
    main(*sys.argv[1:4])
