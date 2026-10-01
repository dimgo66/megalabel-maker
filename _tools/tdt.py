import olefile, struct, glob, os, io

TW = 1440/25.4
def mm(t): return round(t/TW, 3)

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
            out.append((sprm, grp[k:k+sz]))
            continue
        out.append((sprm, grp[k:k+sz]))
        k += sz
    return out

def parse_tdt(op):
    """MS-DOC TDefTableOperand: 1 pad byte, cItcMac int16? Empirically: op[0]=0, op[1]=cItcMac."""
    citc = op[1]
    bnds = [struct.unpack_from('<h', op, 2 + 2*i)[0] for i in range(citc+1)]
    base = 2 + 2*(citc+1)
    tcs = []
    for i in range(citc):
        tc = op[base + i*20: base + i*20 + 20]
        if len(tc) < 20:
            break
        flags, w = struct.unpack_from('<HH', tc, 0)
        tcs.append((w, flags))
    return citc, bnds, base, tcs, len(op)

report = []
for path in sorted(glob.glob(r'C:\Users\User\.dsh\attachments\v1\files\**\*.doc', recursive=True)):
    name = os.path.basename(path)
    wd, tbl = read_streams(path)
    fcP, lcbP = struct.unpack_from('<II', wd, 0x9A + 13*8)
    plc = tbl[fcP:fcP+lcbP]
    n = (lcbP - 4)//8
    pns = [struct.unpack_from('<I', plc, (n+1)*4 + k*4)[0] for k in range(n)]
    report.append('='*100)
    report.append('FILE: ' + name)
    seen_tdt = set()
    rows = 0
    for pn in pns:
        page = wd[pn*512:(pn+1)*512]
        if len(page) < 512: continue
        crun = page[511]
        if not (1 <= crun <= 100): continue
        rgfc = [struct.unpack_from('<I', page, j*4)[0] for j in range(crun+1)]
        bxbase = 4*(crun+1)
        for j in range(crun):
            boff = page[bxbase + j*13]
            if boff == 0: continue
            po = boff*2
            if po >= 511: continue
            cw = page[po]
            if cw == 0: continue
            grp = page[po+1: po+1+cw*2]
            sprms = walk_sprms(grp[2:])
            tdt = [op for (s, op) in sprms if s == 0xD608]
            rw = [struct.unpack_from('<h', op, 0)[0] for (s, op) in sprms if s in (0xD606, 0x9407)]
            inTable = any(s == 0x2416 for (s, _) in sprms)
            ttp = [op[0] for (s, op) in sprms if s == 0x2417 and len(op) >= 1]
            for op in tdt:
                key = op.hex()
                if key in seen_tdt: continue
                seen_tdt.add(key)
                citc, bnds, base, tcs, oplen = parse_tdt(op)
                report.append(f'  TDT cItcMac={citc} opLen={oplen} tcBase={base} tcsLeft={oplen-base}')
                report.append(f'    boundaries twips={bnds} mm={[mm(x) for x in bnds]}')
                report.append(f'    steps twips={[bnds[i+1]-bnds[i] for i in range(citc)]} mm={[mm(bnds[i+1]-bnds[i]) for i in range(citc)]}')
                report.append(f'    totalWidth={bnds[-1]-bnds[0]} tw = {mm(bnds[-1]-bnds[0])} mm')
                report.append(f'    TC widths twips={[t[0] for t in tcs]} mm={[mm(t[0]) for t in tcs]}')
                report.append(f'    TC flags={[hex(t[1]) for t in tcs]}')
                # full tc hex
                report.append(f'    TC hex={op[base:base+20*citc].hex(" ")}')
            if rw:
                report.append(f'    rowHeights (0xD606/0x9407) = {[(v, "auto" if v==0 else mm(v)) for v in rw]}')
            rows += 1
    report.append(f'  paragraphs with PAPX: {rows}')

with open(r'D:\Yandex.Disk\www-yandex\megalabel-maker\_tools\tdt_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(report))
print('ok', len(report))
