import olefile, struct, glob, os

def read(path):
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    flags = struct.unpack_from('<H', wd, 0x0A)[0]
    tname = '1Table' if (flags >> 9) & 1 else '0Table'
    tbl = ole.openstream(tname).read()
    ole.close()
    return wd, tbl

def clx(wd, tbl):
    fcClx, lcbClx = struct.unpack_from('<i', wd, 0x01A2)[0], struct.unpack_from('<i', wd, 0x01A6)[0]
    data = tbl[fcClx: fcClx+lcbClx]
    i = 0
    pcdt = None
    while i < len(data):
        t = data[i]
        if t == 1:
            cb = struct.unpack_from('<H', data, i+1)[0]
            i += 3 + cb
        elif t == 2:
            lcb = struct.unpack_from('<I', data, i+1)[0]
            pcdt = data[i+5:i+5+lcb]
            break
        else:
            break
    return pcdt

def text(wd, pcdt):
    n = (len(pcdt) - 4)//12
    cps = [struct.unpack_from('<I', pcdt, k*4)[0] for k in range(n+1)]
    parts = []
    for k in range(n):
        off = (n+1)*4 + k*8
        fc = struct.unpack_from('<I', pcdt, off+2)[0]
        comp = bool(fc & 0x40000000)
        fcv = fc & 0x3FFFFFFF
        cch = cps[k+1]-cps[k]
        if comp:
            parts.append(wd[fcv//2: fcv//2+cch].decode('cp1251', 'replace'))
        else:
            parts.append(wd[fcv: fcv+cch*2].decode('utf-16-le', 'replace'))
    return ''.join(parts)

for path in sorted(glob.glob(r'C:\Users\User\.dsh\attachments\v1\files\**\*.doc', recursive=True)):
    name = os.path.basename(path)
    wd, tbl = read(path)
    p = clx(wd, tbl)
    t = text(wd, p)
    ccpText = struct.unpack_from('<i', wd, 0x4C)[0]
    ccpFtn = struct.unpack_from('<i', wd, 0x50)[0]
    ccpHdd = struct.unpack_from('<i', wd, 0x54)[0]
    main = t[:ccpText]
    marks = {'cell': main.count('\x07'), 'para': main.count('\r'), 'page': main.count('\x0c'),
             'line': main.count('\x0b'), 'chars': len(main)}
    print(f'{name:24} ccpText={ccpText:4} main={len(main):4} ' + ' '.join(f'{k}={v}' for k, v in marks.items()))
    others = repr(main)
    print('    raw:', others[:200])
