import olefile, struct, glob, sys, os

TW = 1440/25.4  # twips per mm

def mm(tw): return tw/TW

def streams(path):
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    flags = struct.unpack_from('<H', wd, 0x0A)[0]
    which = (flags >> 9) & 1
    tname = '1Table' if which else '0Table'
    if not ole.exists(tname):
        tname = '1Table' if ole.exists('1Table') else '0Table'
    tbl = ole.openstream(tname).read()
    nfib = struct.unpack_from('<H', wd, 2)[0]
    ole.close()
    return wd, tbl, nfib, tname

def fib_pairs(wd):
    csw = struct.unpack_from('<H', wd, 0x20)[0]
    off = 0x22 + csw*2
    cslw = struct.unpack_from('<H', wd, off)[0]
    off += 2 + cslw*4
    cbRgFcLcb = struct.unpack_from('<H', wd, off)[0]
    off += 2
    pairs = {}
    for i in range(cbRgFcLcb//8):
        fc, lcb = struct.unpack_from('<II', wd, off + i*8)
        pairs[i] = (fc, lcb)
    return pairs

def scan_tdeftable(data):
    """Find sprmTDefTable 0xD608 occurrences and decode."""
    out = []
    i = 0
    n = len(data)
    while True:
        i = data.find(b'\x08\xd6', i)
        if i < 0:
            break
        cands = []
        # variant A: spra6 -> 1-byte cb then (if 0xFF) 2-byte cb
        for variant in ('A','B'):
            try:
                if variant == 'A':
                    cb = data[i+2]
                    p = i+3
                    if cb == 0xFF:
                        cb = struct.unpack_from('<H', data, i+3)[0]
                        p = i+5
                else:
                    cb = struct.unpack_from('<H', data, i+2)[0]
                    p = i+4
                if cb < 4 or cb > 2000 or i+6 > n:
                    continue
                citc = struct.unpack_from('<h', data, p)[0]
                if citc < 2 or citc > 40:
                    continue
                bnds = [struct.unpack_from('<h', data, p+2+2*k)[0] for k in range(citc)]
                # validate
                if bnds[0] != 0 and bnds[0] != 108:
                    continue
                mono = all(bnds[k] < bnds[k+1] for k in range(citc-1))
                if not mono:
                    continue
                if not (3000 <= bnds[-1] <= 12000):
                    continue
                if p + 2 + 2*citc > i + 2 + cb + 2:
                    continue
                cands.append((variant, i, cb, citc, bnds))
            except Exception:
                pass
        for c in cands:
            out.append(c)
        i += 1
    return out

def dump_sprms(grpprl, label):
    """Print sprms from a grpprl (2-byte aligned code + operand)."""
    res = []
    k = 0
    while k + 2 <= len(grpprl):
        sprm = struct.unpack_from('<H', grpprl, k)[0]
        spra = (sprm >> 13) & 7
        k += 2
        if spra in (0, 1):
            size = 1
        elif spra in (2, 4, 5):
            size = 2
        elif spra == 7:
            size = 3
        elif spra == 3:
            size = 4
        else:  # 6 variable
            if k >= len(grpprl):
                break
            b = grpprl[k]
            if b == 0xFF:
                size = 2 + struct.unpack_from('<H', grpprl, k+1)[0]
                k += 3
            else:
                size = 1 + b
                k += 1
            res.append((sprm, grpprl[k:k+size]))
            k += size
            continue
        res.append((sprm, grpprl[k:k+size]))
        k += size
    return res

def parse_papx_fkp(wd, fc, lcb):
    out = []
    plc = wd[fc:fc+lcb]
    n = (len(plc) - 4) // 8
    fcs = [struct.unpack_from('<I', plc, k*4)[0] for k in range(n+1)]
    for k in range(n):
        pn = struct.unpack_from('<I', plc, (n+1)*4 + k*4)[0]
        page = wd[pn*512: pn*512+512]
        if len(page) < 512:
            continue
        crun = page[511]
        if crun == 0 or crun > 100:
            continue
        rgfc = [struct.unpack_from('<I', page, j*4)[0] for j in range(crun+1)]
        bxbase = 4*(crun+1)
        for j in range(crun):
            boff = page[bxbase + j*13]
            if boff == 0:
                continue
            po = boff*2
            if po >= 511:
                continue
            cw = page[po]
            if cw == 0:
                continue
            grpprl = page[po+1: po+1+cw*2]
            out.append((rgfc[j], rgfc[j+1], struct.unpack_from('<H', grpprl, 0)[0] if len(grpprl) >= 2 else -1, grpprl[2:]))
    return out

for path in sorted(glob.glob(r'C:\Users\User\.dsh\attachments\v1\files\**\*.doc', recursive=True)):
    name = os.path.basename(path)
    print('='*90)
    print('FILE:', name)
    try:
        wd, tbl, nfib, tname = streams(path)
        print(f'  nFib={nfib} table={tname} wd={len(wd)} tbl={len(tbl)}')
        pairs = fib_pairs(wd)
        for idx, nm in ((6, 'Plcfsed'), (12, 'PlcfbteChpx'), (13, 'PlcfbtePapx'), (33, 'Clx')):
            print(f'  {nm} fc={pairs.get(idx,(0,0))[0]} lcb={pairs.get(idx,(0,0))[1]}')
        # ---- brute-force table scan in both streams
        for sname, sdata in (('WordDocument', wd), (tname, tbl)):
            cands = scan_tdeftable(sdata)
            for (variant, i, cb, citc, bnds) in cands:
                widths = [bnds[k+1]-bnds[k] for k in range(citc-1)]
                print(f'  [TDefTable/{sname} var{variant} @{i}] cb={cb} cItcMac={citc}')
                print(f'      boundaries twips = {bnds}')
                print(f'      boundaries mm    = {[round(mm(b),2) for b in bnds]}')
                print(f'      cell widths twips= {widths}')
                print(f'      cell widths mm   = {[round(mm(w),2) for w in widths]}')
                print(f'      table width mm   = {round(mm(bnds[-1]),2)}')
        # ---- PAPX
        fcp, lcbp = pairs.get(13, (0, 0))
        print(f'  fcClx raw@0x1A2 = {wd[0x1A2:0x1AA].hex(" ")}')
        if lcbp:
            for plcstream, plcname in ((tbl, tname), (wd, 'WordDocument')):
                try:
                    rows = parse_papx_fkp(plcstream, fcp, lcbp)
                    print(f'  PAPX via plc from {plcname}: {len(rows)} paragraphs')
                    for (f0, f1, istd, grp) in rows[:60]:
                        sprms = dump_sprms(grp, name)
                        txt = '; '.join(f'{hex(s)}[{o.hex(" ")}]' for (s, o) in sprms)
                        print(f'    PAPX fc={f0}-{f1} istd={istd} len={len(grp)}: {txt[:400]}')
                    if rows:
                        break
                except Exception as e:
                    print(f'  PAPX[{plcname}] error:', e)
        # ---- text marks
        ccpText = struct.unpack_from('<i', wd, 0x4C)[0]
        print(f'  ccpText={ccpText}')
    except Exception as e:
        import traceback; traceback.print_exc()
