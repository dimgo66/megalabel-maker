import olefile, struct, glob, os

def read(path):
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    fl = struct.unpack_from('<H', wd, 0x0A)[0]
    tn = '1Table' if (fl >> 9) & 1 else '0Table'
    tbl = ole.openstream(tn).read()
    ole.close()
    return wd, tbl

def walk(grp):
    out = []
    k, n = 0, len(grp)
    while k + 2 <= n:
        sprm = struct.unpack_from('<H', grp, k)[0]
        spra = (sprm >> 13) & 7
        k += 2
        if spra in (0, 1): sz = 1
        elif spra in (2, 4, 5): sz = 2
        elif spra == 7: sz = 3
        elif spra == 3: sz = 4
        else:
            if k >= n: break
            b = grp[k]
            if b == 0xFF:
                if k + 3 > n: break
                sz = 2 + struct.unpack_from('<H', grp, k+1)[0]; k += 3
            else:
                sz = 1 + b; k += 1
            out.append((sprm, grp[k:k+sz])); k += sz; continue
        out.append((sprm, grp[k:k+sz])); k += sz
    return out

for path in sorted(glob.glob(r'C:\Users\User\.dsh\attachments\v1\files\**\*.doc', recursive=True)):
    name = os.path.basename(path)
    wd, tbl = read(path)
    fcP, lcbP = struct.unpack_from('<II', wd, 0x9A + 13*8)
    plc = tbl[fcP:fcP+lcbP]
    n = (lcbP - 4)//8
    pns = [struct.unpack_from('<I', plc, (n+1)*4 + k*4)[0] for k in range(n)]
    paras = []
    for pn in pns:
        page = wd[pn*512:(pn+1)*512]
        if len(page) < 512: continue
        crun = page[511]
        if not (1 <= crun <= 100): continue
        rgfc = [struct.unpack_from('<I', page, j*4)[0] for j in range(crun+1)]
        bxbase = 4*(crun+1)
        for j in range(crun):
            boff = page[bxbase + j*13]
            po = boff*2
            if boff == 0 or po >= 511: 
                paras.append((rgfc[j], rgfc[j+1], None, None, None))
                continue
            cw = page[po]
            if cw == 0:
                paras.append((rgfc[j], rgfc[j+1], None, None, None)); continue
            grp = page[po+1: po+1+cw*2]
            sprms = walk(grp[2:])
            fIn = None; fTtp = None; rh = None; tdt = None
            for (s, op) in sprms:
                if s == 0x2416 and len(op) >= 1: fIn = op[0] & 1
                if s == 0x2417 and len(op) >= 1: fTtp = op[0] & 1
                if s in (0xD606, 0x9407) and len(op) >= 2: rh = struct.unpack_from('<h', op, 0)[0]
                if s == 0xD608: tdt = op
            paras.append((rgfc[j], rgfc[j+1], fIn, fTtp, rh, tdt))

    valid = [p for p in paras if p[2] is not None]
    rows = sum(1 for p in valid if p[3])
    intable = sum(1 for p in valid if p[2])
    print('='*80)
    print(f'{name}: paragraphs={len(valid)} inTable={intable} rowMarks(fTtp)={rows}')
    # group into rows: a row ends at a fTtp paragraph
    cur = 0
    rowshape = []
    for p in valid:
        if p[2]:
            cur += 1
        if p[3]:
            rowshape.append(cur); cur = 0
    print(f'  cells per row = {rowshape}')
    print(f'  row count = {len(rowshape)}, total cells = {sum(rowshape)}')
    for i, p in enumerate(valid[:4]):
        print(f'    p{i}: fc={p[0]}-{p[1]} fInTable={p[2]} fTtp={p[3]} rowH={p[4]} tdtLen={len(p[5]) if p[5] else None}')
