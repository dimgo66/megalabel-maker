import olefile, struct, glob, os

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
    fcP, lcbP = struct.unpack_from('<II', wd, 0x9A + 13*8)
    plc = tbl[fcP:fcP+lcbP]
    n = (lcbP - 4)//8
    pns = [struct.unpack_from('<I', plc, (n+1)*4 + k*4)[0] for k in range(n)]
    seq = []
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
            cw = page[po]
            if cw == 0: continue
            grp = page[po+1: po+1+cw*2]
            sprms = walk(grp[2:])
            fTtp = next((op[0] & 1 for (s, op) in sprms if s == 0x2417 and len(op) >= 1), 0)
            rh = next((struct.unpack_from('<h', op, 0)[0] for (s, op) in sprms if s in (0xD606, 0x9407) and len(op) >= 2), None)
            tdt = next((op for (s, op) in sprms if s == 0xD608), None)
            citc = tdt[1] if tdt else None
            b0 = struct.unpack_from('<h', tdt, 2)[0] if tdt else None
            bl = struct.unpack_from('<h', tdt, 2 + 2*citc)[0] if tdt else None
            seq.append((fTtp, rh, citc, b0, bl))
    print('='*80)
    print(name)
    runs = []
    for (ttp, rh, citc, b0, bl) in seq:
        if runs and runs[-1][0] == (citc, b0, bl):
            runs[-1][1] += 1
            runs[-1][2].append(rh)
        else:
            runs.append([(citc, b0, bl), 1, [rh]])
    for (key, cnt, rhs) in runs:
        print(f'   layout(cItcMac={key[0]}, first={key[1]}, last={key[2]}): {cnt} paragraphs, rowHeights={rhs}')
