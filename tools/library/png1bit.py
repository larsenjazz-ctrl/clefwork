"""A PNG (8-bit RGB, RGBA, grey or grey+alpha) -> a 1-bit black-and-white PNG, for score pictures.

    python3 png1bit.py IN.png OUT.png [threshold 0-255, default 170]
"""
import struct, sys, zlib


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos, idat, w = 8, b'', 0
    while pos < len(data):
        n = struct.unpack('>I', data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + n]
        if kind == b'IHDR':
            w, h, depth, ctype = struct.unpack('>IIBB', body[:10])
            assert depth == 8, 'only 8-bit PNGs'
        elif kind == b'IDAT':
            idat += body
        pos += 12 + n
    bpp = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(idat)
    stride = w * bpp
    rows, prev = [], bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else b if pb <= pc else c
                line[i] = (line[i] + pr) & 255
        rows.append(line)
        prev = line
    return w, h, bpp, ctype, rows


def to_1bit(path, out, threshold=170):
    w, h, bpp, ctype, rows = read_png(path)
    packed = bytearray()
    for line in rows:
        packed.append(0)
        byte, nbits = 0, 0
        for x in range(w):
            i = x * bpp
            if ctype in (2, 6):
                lum = (line[i] * 299 + line[i + 1] * 587 + line[i + 2] * 114) // 1000
                alpha = line[i + 3] if ctype == 6 else 255
            else:
                lum, alpha = line[i], line[i + 1] if ctype == 4 else 255
            lum = 255 - ((255 - lum) * alpha) // 255          # on white
            byte = (byte << 1) | (1 if lum >= threshold else 0)   # 1 = white
            nbits += 1
            if nbits == 8:
                packed.append(byte)
                byte, nbits = 0, 0
        if nbits:
            packed.append(byte << (8 - nbits))

    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 1, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(packed), 9)) + chunk(b'IEND', b'')
    open(out, 'wb').write(png)
    return w, h, len(png)


if __name__ == '__main__':
    print(to_1bit(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 170))
