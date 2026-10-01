import olefile, struct, re, sys

TPMM = 1440 / 25.4
FILES = [
    (r"C:\Users\User\.dsh\attachments\v1\files\4f\4f1e5711bf6b2c97fc86275726f9a68e21c88d1acc52229804b4b19e6301df6e\73581-d-60-12.doc", "d-60 (round 60mm), 12?"),
    (r"C:\Users\User\.dsh\attachments\v1\files\59\593e3f89af29ee13bf75f3c81054d790046da070306d02bacdfcfaf11da8e659\73649-38-16-9.doc", "38 x 16.9"),
    (r"C:\Users\User\.dsh\attachments\v1\files\5b\5b85a0c95b1a87268c2b6d40fb4322134f52d074a06330c900947cc7af7e60de\73571-99-34.doc", "99 x 34"),
    (r"C:\Users\User\.dsh\attachments\v1\files\d5\d57ea8e2eb8846b50c989c295fbb93c738d5d539728659ce3e6d8c2179a964a8\73622-105-57.doc", "105 x 57"),
    (r"C:\Users\User\.dsh\attachments\v1\files\2e\2ec7f8d37660d634646fc2f08ecb7fadc51614c1d4bcb7b07f6518f4b0fb3e5c\73572-66-7-46.doc", "66.7 x 46"),
    (r"C:\Users\User\.dsh\attachments\v1\files\4b\4bbfadcf1167d000266956dd6d15eef15c6faae2c8e93dd83e43dc34cf8b6016\73642-52-5-35.doc", "52.5 x 35"),
]
mm = lambda t: round(t / TPMM, 2)

for path, hint in FILES:
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    tn = '1Table' if ole.exists('1Table') else '0Table'
    tab = ole.openstream(tn).read()
    name = path.split('\\')[-1]
    print('=' * 100)
    print(name, '  filename hint:', hint)
    # --- text
    fcClx, lcbClx = struct.unpack_from('<II', wd, 0x01A2)
    clx = tab[fcClx:fcClx + lcbClx]
    i = 0; pcdt = None
    while i < len(clx):
        t = clx[i]
        if t == 1:
            cb = struct.unpack_from('<H', clx, i + 1)[0]; i += 3 + cb
        elif t == 2:
            lcb = struct.unpack_from('<I', clx, i + 1)[0]; pcdt = clx[i + 5:i + 5 + lcb]; i += 5 + lcb
        else: break
    n = (len(pcdt) - 4) // 12
    cps = [struct.unpack_from('<I', pcdt, k * 4)[0] for k in range(n + 1)]
    text = ''
    for k in range(n):
        off = (n + 1) * 4 + k * 8
        fc = struct.unpack_from('<I', pcdt, off + 2)[0]
        comp = bool(fc & 0x40000000); fcv = fc & 0x3FFFFFFF
        cch = cps[k + 1] - cps[k]
        if comp: text += wd[fcv // 2:fcv // 2 + cch].decode('cp1251', 'replace')
        else: text += wd[fcv:fcv + cch * 2].decode('utf-16-le', 'replace')
    marks = text.count('\x07'); crs = text.count('\r')
    print('  text len %d  \\x07=%d  \\x0d=%d' % (len(text), marks, crs))

    # --- SEPX (PlcfSed in TABLE stream, SED = fn(u16)+fcSepx(u32)+6 bytes, stride 12)
    fc, lcb = struct.unpack_from('<II', wd, 0x9a + 6 * 8)
    plc = tab[fc:fc + lcb]
    ns = (lcb - 4) // 12
    print('  PlcfSed n=%d' % ns)
    for k in range(ns):
        off = (ns + 1) * 4 + k * 12
        fn = struct.unpack_from('<H', plc, off)[0]
        fcs = struct.unpack_from('<I', plc, off + 2)[0]
        cb = struct.unpack_from('<H', wd, fcs)[0]
        raw = wd[fcs + 2:fcs + 2 + cb]
        print('   sed %d fn=%d fcSepx=%d cb=%d raw=%s' % (k, fn, fcs, cb, raw.hex()))

    # --- D608 occurrences
    hits = [m.start() for m in re.finditer(b'\x08\xd6', wd)]
    print('  D608 count = %d' % len(hits))
    for h in hits[:2]:
        L = wd[h + 2]
        op = wd[h + 3:h + 3 + L]
        itc = (L - 4) // 22
        print('   L=%d itc=(L-4)/22=%s operand[0:2]=%s highbyte=%d' %
              (L, (L - 4) / 22, op[0:2].hex(), op[1]))
        if (L - 4) % 22 == 0:
            bnd = [struct.unpack_from('<h', op, 2 + 2 * j)[0] for j in range(itc + 1)]
            print('     boundaries tw:', bnd, ' mm:', [mm(b) for b in bnd])
            print('     widths tw:', [bnd[j + 1] - bnd[j] for j in range(itc)],
                  ' mm:', [mm(bnd[j + 1] - bnd[j]) for j in range(itc)])
            tcs = []
            base = 2 + 2 * (itc + 1)
            for j in range(itc):
                rgf = struct.unpack_from('<H', op, base + 20 * j)[0]
                w = struct.unpack_from('<H', op, base + 20 * j + 2)[0]
                tcs.append((hex(rgf), w, mm(w)))
            print('     TCs (rgf,wWidth tw,mm):', tcs)
    # --- 0x9407 row heights
    rows = [m.start() for m in re.finditer(b'\x07\x94', wd)]
    vals = []
    for h in rows:
        v = struct.unpack_from('<h', wd, h + 2)[0]
        vals.append(v)
    print('  0x9407 hits=%d values(signed tw)=%s  abs mm=%s' %
          (len(vals), vals[:8], [mm(abs(v)) for v in vals[:8]]))
    print('  rows via marks/(itc+1): check above')
