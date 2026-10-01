"""Engrave every hymn (hymns.json) with Verovio and write library/<id>.svg.gz, gzipped SVG.

    VENV_PYTHON render_hymns.py HYMNS.json OUT_DIR
"""
import gzip, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import verovio
import lib2mei

pieces = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
tk = verovio.toolkit()
tk.setOptions({'pageWidth': 2200, 'pageHeight': 3000, 'scale': 45, 'adjustPageHeight': True, 'header': 'none', 'footer': 'none',
               'breaks': 'auto', 'svgViewBox': True, 'svgRemoveXlink': True, 'svgFormatRaw': True})
total = 0
for p in pieces:
    tk.loadData(lib2mei.mei(p))
    svg = tk.renderToSVG(1)
    data = gzip.compress(svg.encode('utf-8'), 9)
    open(os.path.join(out, p['id'] + '.svg.gz'), 'wb').write(data)
    p['score'] = p['id'] + '.svg.gz'
    p['pages'] = tk.getPageCount()
    total += len(data)
json.dump(pieces, open(sys.argv[1], 'w'), indent=0, ensure_ascii=False)
print(len(pieces), 'scores,', total // 1024, 'KB')
