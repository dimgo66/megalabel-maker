import olefile, struct, glob, os, io

TW = 1440/25.4
def mm(t): return round(t/TW, 3)

SECT_SPRMS = {
    0xB01F: ('sprmSXaPage', 'page width'),
    0xB020: ('sprmSYaPage', 'page height'),
    0xB021: ('sprmSDxaLeft', 'left margin'),
    0xB022: ('sprmSDxaRight', 'right margin'),
    0xB023: ('sprmSDyaTop', 'top margin'),
    0xB024: ('sprmSDyaBottom', 'bottom margin'),
    0xB017: ('sprmSDyaHdrTop', 'header top'),
    0xB018: ('sprmSDyaHdrBottom', 'header bottom'),
    0xB01E: ('sprmSDxaColumns', 'column spacing'),
    0xB01D: ('sprmSNCols', 'ncols'),
    0x9023: ('sprmSDxaGutter', 'gutter'),
    0xB019: ('sprmSDyaHdrBottom?', ''),
    0xB025: ('sprmSDyaGutter?', ''),
    0xB026: ('sprmSDyaHdrBottom?', ''),
    0xB027: ('sprmSDyaTop?', ''),
    0x903D: ('sprmSDxaLeft1?', ''),
    0x3009: ('sprmSXaPage?', ''),
}

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

out = []
for path in sorted(glob.glob(r'C:\Users\User\.dsh\attachments\v1\files\**\*.doc', recursive=True)):
    name = os.path.basename(path)
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    flags = struct.unpack_from('<H', wd, 0x0A)[0]
    tname = '1Table' if (flags >> 9) & 1 else '0Table'
    tbl = ole.openstream(tname).read()
    ole.close()
    fcSed, lcbSed = struct.unpack_from('<II', wd, 0x9A + 6*8)
    plc = tbl[fcSed:fcSed+lcbSed]
    cpcount = lcbSed // 4 - 1  # rough
    # 1 section: cp[0],cp[1] then 1 Sed of 12 bytes
    nsec = (lcbSed - 4) // 16
    out.append('='*90)
    out.append(f'FILE {name}  lcbPlcfsed={lcbSed}')
    for s in range(max(nsec, 1)):
        base = 4*(nsec+1) + s*16
        if base + 12 > len(plc): 
            base = 8 + s*12
        fcSepx = struct.unpack_from('<i', plc, base)[0]
        if not (0 < fcSepx < len(wd) - 2):
            out.append(f'  section {s}: fcSepx={fcSepx} out of range')
            continue
        cb = struct.unpack_from('<H', wd, fcSepx)[0]
        grp = wd[fcSepx+2: fcSepx+2+cb]
        out.append(f'  section {s}: fcSepx={fcSepx} cb={cb}')
        for (sprm, op) in walk(grp):
            nm = SECT_SPRMS.get(sprm, (hex(sprm), ''))
            if sprm in (0xB01F, 0xB020, 0xB021, 0xB022, 0xB023, 0xB024, 0xB017, 0xB018, 0xB01E, 0x9023):
                v = struct.unpack_from('<h', op, 0)[0] if len(op) >= 2 else op[0]
                out.append(f'      {nm[0]:22} ({nm[1]:14}) = {v:6} twips = {mm(v):8} mm')
            elif sprm == 0xB01D:
                out.append(f'      {nm[0]:22} = {op[0]}')
            else:
                out.append(f'      {hex(sprm):8} len={len(op)} raw={op.hex(" ")[:60]}')
print('\n'.join(out))
with open(r'D:\Yandex.Disk\www-yandex\megalabel-maker\_tools\sepx_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
