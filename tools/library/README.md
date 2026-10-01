# Building the library

The library (`library/data.js`, the score pictures in `library/`, and the index `src/library-index.js`) is built from public-domain and CC0 sources by these scripts. Pieces are only ever added at the end, with `v` set to the library version they arrived in (`VERSION` in `build_data.py`), so quiz codes keep choosing from the same pieces.

| Source | Licence | What it gives | Script |
| --- | --- | --- | --- |
| [Open Hymnal Project](http://openhymnal.org) 2014.06 ABC files | Public domain (only hymns whose files say the music is public domain) | 218 SATB hymns, their scores, 199 hymn tunes | `abc2lib.py`, `render_hymns.py`, `tunes.py` |
| [OpenScore Lieder Corpus](https://github.com/OpenScore/Lieder) v3.0.0 (Zenodo 15450143) | CC0 1.0 — credit requested: *OpenScore Lieder Corpus, MuseScore and contributors* | 20 vocal lines | `mscx2lib.py` |
| [Mutopia Project](https://www.mutopiaproject.org) piano pieces marked Public Domain | Public domain | 73 score pictures (first page), notes from 59 MIDI files | `mutopia2lib.py`, `midi2lib.py`, `png1bit.py` |
| Entered by hand (`hand.json`) | Public-domain tunes; the encodings are Clefwork's own | 17 well-known melodies — **proofread before use** | — |

Steps (Python 3; `render_hymns.py` needs [Verovio](https://www.verovio.org) 5.x, e.g. in a virtual environment):

```
python3 abc2lib.py OPENHYMNAL_DIR hymns.json
VENV/bin/python render_hymns.py hymns.json ../../library
python3 tunes.py hymns.json tunes.json
python3 mscx2lib.py LIEDER_DIR lieder.json
python3 mutopia2lib.py piano-solo.json WORK ../../library piano.json      # piano-solo.json: the Mutopia piano listing
python3 midi2lib.py piano.json piano-solo.json WORK
python3 build_data.py ../../library ../../src/library-index.js hand.json lieder.json tunes.json hymns.json piano.json
```

The JSON files here are the converted sources, kept so the library can be rebuilt or added to without downloading anything again.
