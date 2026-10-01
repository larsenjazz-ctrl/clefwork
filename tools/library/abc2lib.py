"""Open Hymnal ABC files -> Clefwork library pieces (JSON).

Reads the hymns whose music is stated to be public domain, in a meter and key Clefwork can write,
with four voices (soprano and alto on the treble staff, tenor and bass on the bass staff) and no
repeat endings. Each voice becomes a part: one string of tokens per measure, as src/library.js reads
them. A pickup is filled out with rests at the start, and the last measure with rests at the end.

    python3 abc2lib.py OPENHYMNAL_DIR OUT.json
"""
import json, os, re, sys
from fractions import Fraction as F

STEPS = 'CDEFGAB'
SHARPS = 'FCGDAEB'
MAJOR = {'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1, 'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7}
METERS = {(n, 4) for n in (2, 3, 4, 5, 6)} | {(n, 8) for n in range(3, 13)} | {(2, 2), (3, 2)}
VOICE_NAMES = ['Soprano', 'Alto', 'Tenor', 'Bass']
# Clefwork's note values: (value letter, length as a fraction of a whole note), with dots and triplets.
VALUES = []
for v, L in (('w', F(1)), ('h', F(1, 2)), ('q', F(1, 4)), ('e', F(1, 8)), ('s', F(1, 16))):
    VALUES += [(v, L, ''), (v + '.', L * F(3, 2), ''), (v + 't', L * F(2, 3), 't')]


def key_of(k):
    """K: field -> (fifths, mode) or None for modes Clefwork can't write."""
    k = k.split('%')[0].strip()
    m = re.match(r'^([A-G])([#b]?)\s*(m|min|minor|maj|major|ion|ionian|aeo|aeolian)?\b', k, re.I)
    if not m:
        return None
    tonic = m.group(1).upper() + m.group(2)
    mode = (m.group(3) or '').lower()
    if re.match(r'^[A-G][#b]?\s*(dor|phr|lyd|mix|loc)', k, re.I):
        return None
    minor = mode in ('m', 'min', 'minor', 'aeo', 'aeolian')
    if minor:
        # The relative major is a minor third up.
        i = STEPS.index(tonic[0])
        semis = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[tonic[0]] + (1 if '#' in tonic else -1 if 'b' in tonic else 0)
        rel_step = STEPS[(i + 2) % 7]
        rel_semi = (semis + 3) % 12
        base = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[rel_step]
        diff = (rel_semi - base + 6) % 12 - 6
        rel = rel_step + ('#' if diff == 1 else 'b' if diff == -1 else '')
        if rel not in MAJOR:
            return None
        return MAJOR[rel], 'minor'
    if tonic not in MAJOR:
        return None
    return MAJOR[tonic], 'major'


def key_alts(fifths):
    a = {s: 0 for s in STEPS}
    if fifths > 0:
        for s in SHARPS[:fifths]:
            a[s] = 1
    else:
        for s in SHARPS[::-1][:-fifths]:
            a[s] = -1
    return a


def length_of(s, unit):
    """ABC length suffix ('2', '/2', '3/2', '/', '//') -> fraction of a whole note."""
    if not s:
        return unit
    m = re.match(r'^(\d*)(/*)(\d*)$', s)
    num = int(m.group(1)) if m.group(1) else 1
    slashes = len(m.group(2))
    den = int(m.group(3)) if m.group(3) else (2 ** slashes if slashes else 1)
    if slashes and m.group(3) and slashes > 1:
        den = int(m.group(3)) * 2 ** (slashes - 1)
    return unit * F(num, den)


def split_length(L):
    """A length -> Clefwork values, tied, largest first; None when it can't be written."""
    out = []
    rest = L
    while rest > 0:
        for v, vl, t in sorted(VALUES, key=lambda x: -x[1]):
            if t:
                continue
            if vl <= rest:
                out.append(v)
                rest -= vl
                break
        else:
            return None
        if len(out) > 4:
            return None
    return out


def value_of(L, trip):
    """One note's length -> a single Clefwork value (e.g. 'q.', 'et'), or None."""
    for v, vl, t in VALUES:
        if vl == L and bool(t) == bool(trip):
            return v
    return None


def pitch_name(step, alt, octv):
    return step + {-2: 'bb', -1: 'b', 0: '', 1: '#', 2: '##'}[alt] + str(octv)


TOKEN = re.compile(r"""
    (?P<field>\[[A-Za-z]:[^\]]*\])
  | (?P<deco>![^!]*!|\+[^+]*\+)
  | (?P<quote>"[^"]*")
  | (?P<grace>\{[^}]*\})
  | (?P<tuplet>\((?P<tn>\d)(?::\d*)*)
  | (?P<bar>:*\|[\]\|:]*\d?|\[\||::|\[\d)
  | (?P<chord>\[(?:[\^_=]*[A-Ga-g][,']*)+\](?P<clen>[\d/]*))
  | (?P<note>(?P<acc>\^\^|\^|__|_|=)?(?P<step>[A-Ga-g])(?P<oct>[,']*)(?P<len>[\d/]*))
  | (?P<rest>[zx](?P<rlen>[\d/]*))
  | (?P<broken>[<>]+)
  | (?P<tie>-)
  | (?P<slur>[()])
  | (?P<other>.)
""", re.X)
NOTE_IN_CHORD = re.compile(r"(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)")


class Voice:
    def __init__(self, name):
        self.name = name
        self.bars = [[]]          # each bar: list of events {'len': F, 'ps': [(step, alt, oct)] or None, 'tie': bool, 'trip': bool}
        self.accs = {}
        self.pending_broken = None
        self.tuplet = 0


def parse(path):
    raw = open(path, 'rb').read()
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        text = raw.decode('latin-1')
    head, meter, unit, key, title, composer, source, copyright_ = {}, None, F(1, 8), None, '', '', '', ''
    lines = text.split('\n')
    i = 0
    tempo = None
    for i, ln in enumerate(lines):
        if re.match(r'^[A-Za-z]:', ln):
            f, v = ln[0], ln[2:].strip()
            if f == 'T' and not title:
                title = v
            elif f == 'C':
                mm = re.match(r'^(?:Words and )?Music(?: and Setting)?:\s*(.*)$', v, re.I) or re.search(r'Music(?: and Setting)?:\s*(.*)$', v)
                if mm and not composer:
                    composer = mm.group(1).strip()
                if 'copyright' in v.lower():
                    copyright_ += v + ' '
            elif f == 'S' and not source:
                source = v
            elif f == 'M':
                meter = v.split('%')[0].strip()
            elif f == 'L':
                m = re.match(r'(\d+)/(\d+)', v)
                if m:
                    unit = F(int(m.group(1)), int(m.group(2)))
            elif f == 'Q':
                m = re.search(r'(\d+)/(\d+)\s*=\s*(\d+)', v)
                if m:
                    tempo = (F(int(m.group(1)), int(m.group(2))), int(m.group(3)))
            elif f == 'K':
                key = v
                break
    return dict(title=title, composer=composer, source=source, copyright=copyright_.strip(), meter=meter, unit=unit, key=key, tempo=tempo, body=lines[i + 1:], text=text)


def read_body(h, fifths):
    alts0 = key_alts(fifths)
    voices, cur = {}, None
    unit = h['unit']
    order = []
    for ln in h['body']:
        s = ln.split('%')[0] if not ln.startswith('%%') else ''
        if not s.strip() or re.match(r'^\s*[wWP]:', s):
            continue
        m = re.match(r'^\s*V:\s*(\S+)', s)
        if m:
            cur = m.group(1)
            if cur not in voices:
                voices[cur] = Voice(cur)
                order.append(cur)
            continue
        if re.match(r'^[A-Za-z]:', s):
            if s[0] == 'L':
                mm = re.match(r'L:\s*(\d+)/(\d+)', s)
                if mm:
                    unit = F(int(mm.group(1)), int(mm.group(2)))
            elif s[0] in 'KM':
                raise ValueError('key or meter changes')
            continue
        for t in TOKEN.finditer(s):
            g = t.lastgroup
            if g == 'field':
                inner = t.group('field')[1:-1]
                fk, fv = inner[0], inner[2:].strip()
                if fk == 'V':
                    cur = fv.split()[0]
                    if cur not in voices:
                        voices[cur] = Voice(cur)
                        order.append(cur)
                elif fk in 'KM':
                    raise ValueError('key or meter changes')
                elif fk == 'L':
                    mm = re.match(r'(\d+)/(\d+)', fv)
                    if mm:
                        unit = F(int(mm.group(1)), int(mm.group(2)))
                continue
            if cur is None:
                continue
            v = voices[cur]
            if g == 'bar':
                b = t.group('bar')
                if re.search(r'\[\d|\|\d|:\|\d', b) or b.startswith('[') and len(b) > 1 and b[1].isdigit():
                    raise ValueError('repeat endings')
                if v.bars[-1]:
                    v.bars.append([])
                v.accs = {}
                continue
            if g == 'tuplet':
                if t.group('tn') != '3':
                    raise ValueError('tuplets other than triplets')
                v.tuplet = 3
                continue
            if g == 'tie':
                if v.bars[-1]:
                    v.bars[-1][-1]['tie'] = True
                elif len(v.bars) > 1 and v.bars[-2]:
                    v.bars[-2][-1]['tie'] = True
                continue
            if g == 'broken':
                v.pending_broken = t.group('broken')
                continue
            if g in ('note', 'chord', 'rest'):
                if g == 'note':
                    L = length_of(t.group('len'), unit)
                    parts = [(t.group('acc'), t.group('step'), t.group('oct'))]
                elif g == 'chord':
                    L = length_of(t.group('clen'), unit)
                    parts = NOTE_IN_CHORD.findall(t.group('chord'))
                else:
                    L = length_of(t.group('rlen'), unit)
                    parts = None
                ps = None
                if parts:
                    ps = []
                    for acc, st, oc in parts:
                        step = st.upper()
                        octv = 4 + (1 if st.islower() else 0) + oc.count("'") - oc.count(',')
                        if acc:
                            alt = {'^': 1, '^^': 2, '_': -1, '__': -2, '=': 0}[acc]
                            v.accs[(step, octv)] = alt
                        alt = v.accs.get((step, octv), alts0[step])
                        ps.append((step, alt, octv))
                ev = {'len': L, 'ps': ps, 'tie': False, 'trip': False}
                if v.tuplet:
                    ev['len'] = L * F(2, 3)
                    ev['trip'] = True
                    v.tuplet -= 1
                if v.pending_broken:
                    prev = v.bars[-1][-1] if v.bars[-1] else None
                    k = len(v.pending_broken)
                    big, small = F(2 ** (k + 1) - 1, 2 ** k), F(1, 2 ** k)
                    if prev is not None:
                        if v.pending_broken[0] == '>':
                            prev['len'] *= big
                            ev['len'] *= small
                        else:
                            prev['len'] *= small
                            ev['len'] *= big
                    v.pending_broken = None
                v.bars[-1].append(ev)
                continue
    for v in voices.values():
        if not v.bars[-1]:
            v.bars.pop()
    return [voices[n] for n in order]


def measure_tokens(events, bar_len, pad_front=False, pad_back=False):
    """Events of a measure -> token string, padded with rests; None when Clefwork can't write it."""
    total = sum((e['len'] for e in events), F(0))
    toks = []
    fill = bar_len - total
    if fill < 0:
        return None
    if fill and not (pad_front or pad_back):
        return None
    rests = []
    if fill:
        parts = split_length(fill)
        if parts is None:
            return None
        rests = ['r' + p for p in parts]
    if pad_front:
        toks += rests[::-1]
    for e in events:
        if e['trip']:
            val = value_of(e['len'], True)
            if val is None:
                return None
            vals = [val]
        else:
            val = value_of(e['len'], False)
            vals = [val] if val else split_length(e['len'])
            if vals is None:
                return None
        for j, val in enumerate(vals):
            tie = e['ps'] and (j < len(vals) - 1 or e['tie'])
            if e['ps'] is None:
                toks.append('r' + val)
            else:
                toks.append('+'.join(pitch_name(*p) for p in e['ps']) + val + ('~' if tie else ''))
    if pad_back:
        toks += rests
    return ' '.join(toks)


def convert(path):
    h = parse(path)
    cr = h['copyright'].lower()
    if not (cr.startswith('copyright: public domain') or 'music and setting public domain' in cr):
        return None, 'not stated public domain'
    if not h['meter'] or h['meter'] == 'none':
        return None, 'no meter'
    mm = re.match(r'(\d+)/(\d+)', h['meter'])
    if not mm or (int(mm.group(1)), int(mm.group(2))) not in METERS:
        return None, 'meter ' + str(h['meter'])
    meter = (int(mm.group(1)), int(mm.group(2)))
    k = key_of(h['key'] or '')
    if not k:
        return None, 'key ' + str(h['key'])
    fifths, mode = k
    try:
        voices = read_body(h, fifths)
    except ValueError as e:
        return None, str(e)
    if len(voices) != 4:
        return None, f'{len(voices)} voices'
    bar_len = F(meter[0], meter[1])
    n = len(voices[0].bars)
    if any(len(v.bars) != n for v in voices) or n < 2:
        return None, 'voices have different measure counts'
    parts = []
    for vi, v in enumerate(voices):
        ms = []
        for b, events in enumerate(v.bars):
            tok = measure_tokens(events, bar_len, pad_front=(b == 0), pad_back=(b == n - 1))
            if tok is None:
                return None, f'measure {b + 1} of {VOICE_NAMES[vi]} does not fit'
            ms.append(tok)
        parts.append({'name': VOICE_NAMES[vi], 'clef': 'treble' if vi < 2 else 'bass', 'm': ms})
    # A pickup and the last measure both partial: counted as one measure in the hymnal, two here.
    tempo = 96
    if h['tempo']:
        beat, bpm = h['tempo']
        per_quarter = bpm * beat / F(1, 4)
        tempo = int(max(40, min(160, per_quarter if meter[1] != 2 else per_quarter / 2)))
        tempo = max(56, min(tempo, 120))
    title = re.sub(r'\s+', ' ', h['title']).strip()
    tune = os.path.basename(path)[:-4].split('-', 1)
    tune = tune[1].replace('_', ' ') if len(tune) > 1 else ''
    # "'Antioch' pieced together from "Messiah" George F. Handel, 1741.  Setting: Lowell Mason, 1836."
    comp = re.sub(r'\s+', ' ', h['composer']).strip()
    setting = ''
    ms = re.search(r'\s*Setting:\s*(.*)$', comp)
    if ms:
        setting, comp = ms.group(1).strip().rstrip('.'), comp[:ms.start()]
    # Tune names in quotes ("'Canterbury' or 'Song 13' Orlando Gibbons") and asides ("…, possibly
    # dating from …") are left out of the composer's name.
    for _ in range(8):
        comp = re.sub(r"^(or\s+)?'[^']*'\s*", '', comp).strip()
    comp = re.split(r',\s*(?:possibly|probably|perhaps|presumably)\b', comp)[0].strip().rstrip('.').strip()
    if re.fullmatch(r'(circa|c\.|ca\.)?', comp, re.I):
        comp = ''
    year = ''
    my = re.search(r'\b(1[0-9]{3})\b', comp)
    if my:
        year = my.group(1)
    return {
        'id': 'hymn-' + re.sub(r'[^a-z0-9]+', '-', os.path.basename(path)[:-4].lower()).strip('-'),
        'title': title + (f' ({tune})' if tune and tune.lower() not in title.lower() else ''),
        'by': (comp or 'Traditional')[:80], 'year': year,
        'kind': 'ensemble', 'style': 'Hymn (SATB)',
        'source': 'Open Hymnal Project' + (f'; setting: {setting}' if setting else ''),
        'license': 'Public domain',
        'key': {'fifths': fifths, 'mode': mode}, 'meter': {'n': meter[0], 'd': meter[1]}, 'tempo': tempo,
        'bars': n, 'parts': parts,
    }, None


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    pieces, skipped = [], {}
    for f in sorted(os.listdir(src)):
        if not f.endswith('.abc'):
            continue
        try:
            p, why = convert(os.path.join(src, f))
        except Exception as e:  # a file this parser can't read is skipped, with the reason
            p, why = None, 'error: ' + str(e)[:60]
        if p:
            pieces.append(p)
        else:
            skipped[why] = skipped.get(why, 0) + 1
    json.dump(pieces, open(out, 'w'), indent=0, ensure_ascii=False)
    print(len(pieces), 'hymns converted')
    for why, c in sorted(skipped.items(), key=lambda x: -x[1]):
        print(f'  skipped {c}: {why}')
