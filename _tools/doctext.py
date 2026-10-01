import olefile, sys, struct

def get_fib(data):
    # returns dict
    wIdent, nFib = struct.unpack_from('<HH', data, 0)
    flags = struct.unpack_from('<H', data, 0x0A)[0]
    fWhichTblStm = (flags >> 9) & 1
    fcMin, fcMac = struct.unpack_from('<ii', data, 0x18)
    return dict(wIdent=wIdent, nFib=nFib, fWhichTblStm=fWhichTblStm, fcMin=fcMin, fcMac=fcMac)

def extract(path):
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    fib = get_fib(wd)
    table = None
    for cand in (('1Table',), ('0Table',)):
        if ole.exists(cand[0]):
            if (fib['fWhichTblStm'] == 1 and cand[0] == '1Table') or (fib['fWhichTblStm'] == 0 and cand[0] == '0Table'):
                table = ole.openstream(cand[0]).read()
    if table is None:
        table = ole.openstream('1Table' if ole.exists('1Table') else '0Table').read()
    ccpText = struct.unpack_from('<i', wd, 0x4C)[0]
    fcClx = struct.unpack_from('<i', wd, 0x01A2)[0]
    lcbClx = struct.unpack_from('<i', wd, 0x01A6)[0]
    clx = table[fcClx:fcClx+lcbClx]
    # walk clx
    i = 0
    pcdt = None
    while i < len(clx):
        t = clx[i]
        if t == 1:
            cb = struct.unpack_from('<H', clx, i+1)[0]
            i += 3 + cb
        elif t == 2:
            lcb = struct.unpack_from('<I', clx, i+1)[0]
            pcdt = clx[i+5:i+5+lcb]
            i += 5 + lcb
        else:
            break
    text = []
    if pcdt:
        n = (len(pcdt) - 4) // 12
        cps = [struct.unpack_from('<I', pcdt, k*4)[0] for k in range(n+1)]
        for k in range(n):
            off = (n+1)*4 + k*8
            fc = struct.unpack_from('<I', pcdt, off+2)[0]
            compressed = bool(fc & 0x40000000)
            fcv = fc & 0x3FFFFFFF
            cch = cps[k+1] - cps[k]
            if compressed:
                raw = wd[fcv//2: fcv//2 + cch]
                s = raw.decode('cp1251', errors='replace')
            else:
                raw = wd[fcv: fcv + cch*2]
                s = raw.decode('utf-16-le', errors='replace')
            text.append(s)
    else:
        raw = wd[fib['fcMin']:fib['fcMac']]
        text.append(raw.decode('cp1251', errors='replace'))
    return ''.join(text)

for path in sys.argv[1:]:
    t = extract(path)
    out = path + '.txt'
    with open(out, 'w', encoding='utf-8') as f:
        f.write(t)
    print('OK', path, len(t), '->', out)
