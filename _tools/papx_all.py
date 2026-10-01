import olefile, struct, glob, os, sys, io

OUT = io.StringIO()

def w(*a):
    print(*a, file=OUT)

def read_streams(path):
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    flags = struct.unpack_from('<H', wd, 0x0A)[0]
    tname = '1Table' if (flags >> 9) & 1 else '0Table'
    tbl = ole.openstream(tname).read()
    ole.close()
    return wd, tbl

def walk_sprms(grp):
    out = []
    k = 0
    n = len(grp)
    while k + 2 <= n:
        sprm = struct.unpack_from('<H', grp, k)[0]
        spra = (sprm >> 13) & 7
        k += 2
        if spra in (0, 1):
            sz = 1
        elif spra in (2, 4, 5):
            sz = 2
        elif spra == 7:
            sz = 3
        elif spra == 3:
            sz = 4
        else:
            if k >= n:
                break
            b = grp[k]
            if b == 0xFF:
                if k + 3 > n:
                    break
                sz = 2 + struct.unpack_from('<H', grp, k+1)[0]
                k += 3
            else:
                sz = 1 + b
                k += 1
            out.append((k-1, sprm, grp[k:k+sz]))
            continue
        out.append((k-2, sprm, grp[k:k+sz]))
        k += sz
    return out

def hexbytes(b, start):
    return ' '.join(f'{x:02x}' for x in b)

def tdeftable_analysis(op):
    """Try several interpretations of the TDefTable operand and score them."""
    res = []
    # interpretation A: cItcMac u16 LE at 0, boundaries, then TCs (20 bytes each)
    for off, label in ((0, 'u16@0'), (1, 'cItcMac@1'), (2, 'u16@2')):
        try:
            citc = struct.unpack_from('<H', op, off)[0]
            if not (1 <= citc <= 40):
                continue
            bnds = [struct.unpack_from('<h', op, off+2+2*i)[0] for i in range(citc+1)]
            mono = all(bnds[i] < bnds[i+1] for i in range(citc))
            if not mono:
                continue
            tc_off = off + 2 + 2*(citc+1)
            tcs = []
            for i in range(citc):
                tc = op[tc_off + i*20: tc_off + i*20 + 20]
                if len(tc) < 20:
                    break
                tcs.append(struct.unpack_from('<H', tc, 2)[0])
            res.append((label, citc, bnds, tc_off, tcs))
        except Exception:
            pass
    # interpretation B: 1-byte count at offset 1 then boundaries
    try:
        citc = op[1]
        if 1 <= citc <= 40:
            bnds = [struct.unpack_from('<h', op, 2+2*i)[0] for i in range(citc+1)]
            if all(bnds[i] < bnds[i+1] for i in range(citc)):
                tc_off = 2 + 2*(citc+1)
                tcs = [struct.unpack_from('<H', op[tc_off+i*20:tc_off+i*20+20], 2)[0] for i in range(citc)]
                res.append(('count@1', citc, bnds, tc_off, tcs))
    except Exception:
        pass
    return res

TW = 1440/25.4
def mm(t): return round(t/TW, 2)

for path in sorted(glob.glob(r'C:\Users\User\.dsh\attachments\v1\files\**\*.doc', recursive=True)):
    name = os.path.basename(path)
    wd, tbl = read_streams(path)
    w('='*100)
    w('FILE:', name)
    fcP, lcbP = struct.unpack_from('<II', wd, 0x9A + 13*8)
    plc = tbl[fcP:fcP+lcbP]
    n = (lcbP - 4)//8
    pns = [struct.unpack_from('<I', plc, (n+1)*4 + k*4)[0] for k in range(n)]
    fcs = [struct.unpack_from('<I', plc, k*4)[0] for k in range(n+1)]
    w('  papx pages:', pns)
    seen = 0
    for pn in pns:
        page = wd[pn*512:(pn+1)*512]
        if len(page) < 512:
            continue
        crun = page[511]
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
            grp = page[po+1: po+1+cw*2]
            if len(grp) < 4:
                continue
            istd = struct.unpack_from('<H', grp, 0)[0]
            sprms = walk_sprms(grp[2:])
            codes = [hex(s) for (_, s, _) in sprms]
            has_tab = any(s == 0xD608 for (_, s, _) in sprms)
            w(f'  --- para fc={rgfc[j]}-{rgfc[j+1]} po={po} cw={cw} istd={istd}')
            w(f'      sprms: {" ".join(codes)}')
            for (off, s, op) in sprms:
                if s == 0xD608:
                    w(f'      TDefTable operand ({len(op)} bytes): {hexbytes(op, 0)}')
                    for (label, citc, bnds, tc_off, tcs) in tdeftable_analysis(op):
                        w(f'        [{label}] cItcMac={citc} boundaries={bnds} mm={[mm(x) for x in bnds]}')
                        w(f'             deltas twips={[bnds[i+1]-bnds[i] for i in range(citc)]} mm={[mm(bnds[i+1]-bnds[i]) for i in range(citc)]}')
                        w(f'             tcOff={tc_off} TCwidths twips={tcs} mm={[mm(x) for x in tcs]}')
                if s == 0x9407:
                    v = struct.unpack_from('<h', op, 0)[0]
                    w(f'        rowHeight={v} twips = {"auto" if v == 0 else str(mm(v))+" mm"} (exact={v<0})')
                if s == 0xD606:
                    v = struct.unpack_from('<h', op, 0)[0]
                    w(f'        [0xD606] {v} = {"auto" if v==0 else str(mm(v))+" mm"}')
            seen += 1
            if seen > 40:
                break

with open(r'D:\Yandex.Disk\www-yandex\megalabel-maker\_tools\papx_dump.txt', 'w', encoding='utf-8') as f:
    f.write(OUT.getvalue())
print('written', len(OUT.getvalue()))
