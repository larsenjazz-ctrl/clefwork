"""Clefwork library pieces -> MEI, for Verovio to engrave as score pictures.

Parts go on staves as the piece lays them out: a hymn's soprano and alto share the treble staff
(stems up and down) and its tenor and bass the bass staff; a melody has one staff; a piano piece's
parts each have a staff. Accidentals are printed as a score would: against the key signature and
the notes before them in the measure, on that staff. Eighths and shorter are beamed by the beat.
"""
import re
from fractions import Fraction as F
from xml.sax.saxutils import escape

STEPS = 'CDEFGAB'
SHARPS = 'FCGDAEB'
DUR = {'w': 1, 'h': 2, 'q': 4, 'e': 8, 's': 16}
LEN = {'w': F(1), 'h': F(1, 2), 'q': F(1, 4), 'e': F(1, 8), 's': F(1, 16)}
TOKEN = re.compile(r'^((?:r)|(?:[A-G](?:bb|b|##|#|x|n)?-?\d)(?:\+[A-G](?:bb|b|##|#|x|n)?-?\d)*)([whqes])(\.?)(t?)(~?)$')
PITCH = re.compile(r'^([A-G])(bb|b|##|#|x|n)?(-?\d)$')
ALT = {'': 0, 'n': 0, '#': 1, '##': 2, 'x': 2, 'b': -1, 'bb': -2}
ACCID = {-2: 'ff', -1: 'f', 0: 'n', 1: 's', 2: 'x'}


def key_alts(fifths):
    a = {s: 0 for s in STEPS}
    for s in (SHARPS[:fifths] if fifths > 0 else SHARPS[::-1][:-fifths]):
        a[s] = 1 if fifths > 0 else -1
    return a


def events(measure):
    out = []
    for tok in measure.split():
        m = TOKEN.match(tok)
        if not m:
            continue
        L = LEN[m.group(2)] * (F(3, 2) if m.group(3) else 1) * (F(2, 3) if m.group(4) else 1)
        ps = None
        if m.group(1) != 'r':
            ps = []
            for p in m.group(1).split('+'):
                pm = PITCH.match(p)
                ps.append((pm.group(1), ALT[pm.group(2) or ''], int(pm.group(3))))
        out.append({'v': m.group(2), 'dot': bool(m.group(3)), 'trip': bool(m.group(4)), 'tie': bool(m.group(5)), 'ps': ps, 'len': L})
    return out


def layout(piece):
    """[(clef, [part indexes])] — the staves and the parts on each."""
    parts = piece['parts']
    if piece['kind'] == 'ensemble' and len(parts) == 4 and [p['clef'] for p in parts] == ['treble', 'treble', 'bass', 'bass']:
        return [('treble', [0, 1]), ('bass', [2, 3])]
    return [(p['clef'], [i]) for i, p in enumerate(parts)]


def mei(piece, first=0, last=None, pickup=True):
    """MEI for measures first..last (0-based, inclusive). With pickup, a first measure that starts
    with rests in every part is written as a pickup (those rests left out); the last measure's trailing
    rests likewise."""
    last = piece['bars'] - 1 if last is None else min(last, piece['bars'] - 1)
    staves = layout(piece)
    k = piece['key']['fifths']
    alts0 = key_alts(k)
    n, d = piece['meter']['n'], piece['meter']['d']
    bar = F(n, d)
    beat = F(3, 8) if d == 8 and n % 3 == 0 and n > 3 else F(1, d)
    ks = '0' if k == 0 else f'{abs(k)}{"s" if k > 0 else "f"}'
    parts = [[events(p['m'][m]) for m in range(first, last + 1)] for p in piece['parts']]

    def lead_rest(evs):
        t = F(0)
        for e in evs:
            if e['ps']:
                break
            t += e['len']
        return t

    def tail_rest(evs):
        t = F(0)
        for e in reversed(evs):
            if e['ps']:
                break
            t += e['len']
        return t
    cut0 = min(lead_rest(p[0]) for p in parts) if pickup and first == 0 else F(0)
    cut1 = min(tail_rest(p[-1]) for p in parts) if pickup and last == piece['bars'] - 1 else F(0)

    def trim(evs, front, back):
        out, t = [], F(0)
        for e in evs:
            if t < front:
                t += e['len']
                continue
            out.append(e)
        if back:
            t = F(0)
            while out and t < back:
                t += out[-1]['len']
                out.pop()
        return out

    uid = [0]
    grp = ' symbol="brace" bar.thru="true"' if len(staves) > 1 else ''

    def nid():
        uid[0] += 1
        return f'n{uid[0]}'

    x = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><music><body><mdiv><score>',
         f'<scoreDef meter.count="{n}" meter.unit="{d}" key.sig="{ks}"><staffGrp{grp}>']
    for si, (clef, _) in enumerate(staves):
        shape, line = ('G', 2) if clef == 'treble' else ('F', 4)
        x.append(f'<staffDef n="{si + 1}" lines="5" clef.shape="{shape}" clef.line="{line}"/>')
    x.append('</staffGrp></scoreDef><section>')
    tie_open = {}
    for mi in range(last - first + 1):
        front = cut0 if mi == 0 else F(0)
        back = cut1 if mi == last - first else F(0)
        partial = front or back
        metcon = ' metcon="false"' if partial else ''
        x.append(f'<measure n="{first + mi + (0 if cut0 and first == 0 else 1)}"{metcon}>')
        for si, (clef, pis) in enumerate(staves):
            x.append(f'<staff n="{si + 1}">')
            # Accidentals on this staff so far in the measure, by onset across its layers.
            shown = {}
            layers = []
            for li, pi in enumerate(pis):
                evs = trim(parts[pi][mi], front, back)
                t = F(0)
                for e in evs:
                    e['at'] = t
                    t += e['len']
                layers.append((li, pi, evs))
            order = sorted(((e['at'], li, e) for li, pi, evs in layers for e in evs if e['ps']), key=lambda z: (z[0], z[1]))
            for _, li, e in order:
                e['accid'] = []
                for (st, alt, oc) in e['ps']:
                    have = shown.get((st, oc), alts0[st])
                    e['accid'].append(ACCID[alt] if alt != have else None)
                    shown[(st, oc)] = alt
            for li, pi, evs in layers:
                x.append(f'<layer n="{li + 1}">')
                x.extend(layer_xml(evs, beat, nid, tie_open, pi))
                x.append('</layer>')
            x.append('</staff>')
        x.append('</measure>')
    x.append('</section></score></mdiv></body></music></mei>')
    return '\n'.join(x)


def note_xml(st, alt, oc, accid, e, nid, tie_open, key, grace=False):
    a = f' accid="{accid}"' if accid else (f' accid.ges="{ACCID[alt]}"' if alt else '')
    tie = ''
    was = tie_open.get(key)
    if was and e['tie']:
        tie = ' tie="m"'
    elif was:
        tie = ' tie="t"'
    elif e['tie']:
        tie = ' tie="i"'
    tie_open[key] = e['tie']
    return f'<note xml:id="{nid()}" pname="{st.lower()}" oct="{oc}"{a}{tie}/>'


def event_xml(e, nid, tie_open, pi):
    dur = DUR[e['v']]
    dots = ' dots="1"' if e['dot'] else ''
    if not e['ps']:
        return f'<rest dur="{dur}"{dots}/>'
    notes = [note_xml(st, alt, oc, e['accid'][j], e, nid, tie_open, (pi, st, oc)) for j, (st, alt, oc) in enumerate(e['ps'])]
    if len(notes) == 1:
        return notes[0].replace('<note ', f'<note dur="{dur}"{dots} ', 1)
    return f'<chord dur="{dur}"{dots}>' + ''.join(notes) + '</chord>'


def layer_xml(evs, beat, nid, tie_open, pi):
    """Events -> MEI, with triplets in tuplets and eighths (and shorter) beamed within a beat."""
    out = []
    i = 0
    while i < len(evs):
        e = evs[i]
        if e['trip']:
            group, total = [], F(0)
            while i < len(evs) and evs[i]['trip']:
                group.append(evs[i])
                total += evs[i]['len']
                i += 1
                if total in (F(1, 8), F(1, 4), F(1, 2), F(3, 16)) and len(group) >= 3:
                    break
            beam = len(group) > 1 and all(g['v'] in 'es' and g['ps'] for g in group)
            inner = ''.join(event_xml(g, nid, tie_open, pi) for g in group)
            out.append('<tuplet num="3" numbase="2">' + (f'<beam>{inner}</beam>' if beam else inner) + '</tuplet>')
            continue
        if e['v'] in 'es' and e['ps']:
            b0 = int(e['at'] / beat)
            group = [e]
            j = i + 1
            while j < len(evs) and evs[j]['v'] in 'es' and evs[j]['ps'] and not evs[j]['trip'] and int(evs[j]['at'] / beat) == b0:
                group.append(evs[j])
                j += 1
            if len(group) > 1:
                out.append('<beam>' + ''.join(event_xml(g, nid, tie_open, pi) for g in group) + '</beam>')
                i = j
                continue
        out.append(event_xml(e, nid, tie_open, pi))
        i += 1
    return out
