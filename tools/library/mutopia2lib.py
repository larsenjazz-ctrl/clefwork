"""Mutopia public-domain piano pieces -> Clefwork library score pictures and entries.

Reads the listing scraped from mutopiaproject.org (piano-solo.json), takes the chosen pieces that are
marked Public Domain, downloads each one's Letter PDF (a second apart), draws its first page with
Quick Look, and writes a 1-bit PNG and a library entry (score only: no notes to play).

    python3 mutopia2lib.py LISTING.json WORK_DIR OUT_DIR OUT.json
"""
import json, os, re, subprocess, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import png1bit

CHOSEN = [6, 7, 8, 16, 17, 18, 19, 20, 21, 32, 36, 37, 38, 39, 53, 54, 56, 59, 60, 61, 62, 63, 64, 66, 67, 69, 71, 73, 74, 76,
          89, 91, 92, 93, 94, 100, 101, 102, 103, 112, 113, 114, 115, 132, 134, 135, 139, 147, 148, 151, 155, 160, 161, 166, 167,
          176, 183, 184, 185, 197, 198, 199, 200, 203, 206, 213, 214, 215, 233, 236, 237, 238, 240]
STYLE = {'Baroque': 'Baroque', 'Classical': 'Classical', 'Romantic': 'Romantic', 'Jazz': 'Ragtime', 'Modern': 'Impressionist', 'Technique': 'Étude', 'March': 'March'}


def main(listing, work, outdir, outjson):
    P = json.load(open(listing))
    pd = [p for p in P if 'Public Domain' in p['cells'] and p['cells'][4] == 'for Piano']
    os.makedirs(work, exist_ok=True)
    os.makedirs(outdir, exist_ok=True)
    out = []
    for i in CHOSEN:
        c, links = pd[i]['cells'], pd[i]['links']
        pdf = next((l for l in links if l.endswith('-let.pdf')), None) or next((l for l in links if l.endswith('-a4.pdf')), None)
        info = next((l for l in links if 'piece-info.cgi?id=' in l), '')
        mid = re.search(r'id=(\d+)', info)
        if not pdf or not mid:
            continue
        pid = 'mutopia-' + mid.group(1)
        local = os.path.join(work, pid + '.pdf')
        if not os.path.exists(local):
            req = urllib.request.Request(pdf, headers={'User-Agent': 'Clefwork library builder (music education)'})
            open(local, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
            time.sleep(1.0)
        subprocess.run(['qlmanage', '-t', '-s', '2200', '-o', work, local], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        png = local + '.png'
        if not os.path.exists(png):
            print('no picture for', c[0])
            continue
        w, h, size = png1bit.to_1bit(png, os.path.join(outdir, pid + '.png'))
        comp = re.sub(r'^by\s+', '', c[1])
        years = re.search(r'\((\d{4})', comp)
        name = re.sub(r'\s*\(.*\)$', '', comp).strip()
        opus = c[2].strip()
        out.append({
            'id': pid, 'title': c[0] + (f', {opus}' if opus and opus not in c[0] else ''), 'by': name, 'year': '',
            'life': years.group(0)[1:] if years else '', 'style': STYLE.get(c[6], c[6]), 'kind': 'piano',
            'source': 'Mutopia Project' + (f' ({c[8]})' if c[8] else ''), 'license': 'Public domain',
            'key': None, 'meter': None, 'tempo': 0, 'bars': 0, 'score': pid + '.png', 'parts': [],
        })
        print(len(out), c[0][:40], f'{size // 1024} KB')
    json.dump(out, open(outjson, 'w'), indent=0, ensure_ascii=False)


if __name__ == '__main__':
    main(*sys.argv[1:5])
