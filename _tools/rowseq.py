import olefile, struct, glob, os

TW = 1440/25.4
def mm(t): return round(t/TW, 3)

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
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    fl = struct.unpack_from('<H', wd, 0x0A)[0]
    tn = '1Table' if (fl >> 9) & 1 else '0Table'
    tbl = ole.openstream(tn).read()
    ole.close()

    def gp(i):
        return struct.unpack_from('<i', wd, 0x9A + i*8)[0], struct.unpack_from('<I', wd, 0x9A + i*8 + 4)[0]

    # section props
    fcSed, lcbSed = gp(6)
    plc = tbl[fcSed:fcSed+lcbSed]
    fcSepx = struct.unpack_from('<i', plc, (len(plc)-4)//4*4 - 8)[0]
    # robust: the Sed's fcSepx is at offset 4*(n+1) ; for 1 section n=1 -> offset 8
    fcSepx = struct.unpack_from('<i', plc, 8)[0]
    cb = struct.unpack_from('<H', wd, fcSepx)[0]
    sgrp = wd[fcSepx+2: fcSepx+2+cb]
    sect = {}
    for (s, op) in walk(sgrp):
        if s in (0xB01F, 0xB020, 0xB021, 0xB022, 0x9023, 0x9024) and len(op) >= 2:
            sect[hex(s)] = struct.unpack_from('<h', op, 0)[0]
        if s == 0x9023 and len(op) >= 2:
            sect['sprmSDyaTop'] = struct.unpack_from('<h', op, 0)[0]
        if s == 0x9024 and len(op) >= 2:
            sect['sprmSDyaBottom'] = struct.unpack_from('<h', op, 0)[0]

    fcP, lcbP = gp(13)
    plc2 = tbl[fcP:fcP+lcbP]
    n = (lcbP - 4)//8
    pns = [struct.unpack_from('<I', plc2, (n+1)*4 + k*4)[0] for k in range(n)]
    print('='*88)
    print(f'{name}')
    print(f'  page: W={mm(sect.get("0xb01f", 11906))} H={mm(sect.get("0xb020", 16838))} mm')
    print(f'  margins L={mm(sect.get("0xb021",0))} R={mm(sect.get("0xb022",0))} '
          f'T={mm(sect.get("sprmSDyaTop", sect.get("0x9023",0)))} B={mm(sect.get("sprmSDyaBottom", sect.get("0x9024",0)))} mm')
    rows = []
    for pn in pns:
        page = wd[pn*512:(pn+1)*512]
        if len(page) < 512: continue
        crun = page[511]
        if not (1 <= crun <= 200): continue
        for j in range(crun):
            boff = page[4*(crun+1) + j*13]
            if boff == 0: continue
            po = boff*2
            if po >= 511: continue
            cw = page[po] if po < 512 else 0
            # PAPX: byte at po is cw (word count of grpprl/2), grpprl at po+1
            if cw == 0: continue
            grp = page[po+1: po+1+cw*2]
            if len(grp) < 4: continue
            sprms = walk(grp[2:])
            fIn = next((op[0] & 1 for (s, op) in sprms if s == 0x2416 and len(op) >= 1), None)
            fTtp = next((op[0] & 1 for (s, op) in sprms if s == 0x2417 and len(op) >= 1), None)
            rh = next((struct.unpack_from('<h', op, 0)[0] for (s, op) in sprms if s in (0xD606, 0x9407) and len(op) >= 2), None)
            if fIn:
                rows.append((fTtp, rh))
    print(f'  in-table paragraphs={len(rows)}  row-end marks={sum(1 for r in rows if r[0])}')
    print('  row heights (twips -> mm):')
    for i, (ttp, rh) in enumerate(rows):
        if ttp:
            print(f'     row: {rh} tw = {"auto" if rh==0 else mm(rh)} mm   exact={rh is not None and rh<0}')
