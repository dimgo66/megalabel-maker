import olefile, struct, glob, os

def recs(data, off, end, depth=0):
    """Yield (offset, ver, inst, type, len, payload_off, payload_len, end)."""
    out = []
    pos = off
    while pos + 8 <= end:
        ver_inst, rtype, rlen = struct.unpack_from('<HHI', data, pos)
        ver = ver_inst & 0x0F
        inst = ver_inst >> 4
        p = pos + 8
        if p + rlen > end:
            break
        out.append((pos, ver, inst, rtype, rlen, p))
        pos = p + rlen
    return out

NAMES = {
    0xF000: 'DggContainer', 0xF001: 'BStoreContainer', 0xF002: 'DggContainer2',
    0xF003: 'BSE', 0xF004: 'SpContainer', 0xF006: 'Dgg', 0xF007: 'BStore',
    0xF008: 'FDGG', 0xF009: 'FBSE', 0xF00A: 'FOPT', 0xF00B: 'FOPT(Sp)',
    0xF00C: 'FOPT', 0xF00D: 'FOPT', 0xF00E: 'FOPT', 0xF00F: 'FOPT',
    0xF010: 'ClientAnchor', 0xF011: 'ClientData', 0xF012: 'FOPT',
    0xF013: 'FOPT', 0xF014: 'FOPT', 0xF015: 'FOPT', 0xF016: 'FOPT',
    0xF017: 'FOPT', 0xF018: 'FOPT', 0xF019: 'FOPT', 0xF01A: 'FOPT',
    0xF01B: 'FOPT', 0xF01C: 'FOPT', 0xF01D: 'FOPT', 0xF01E: 'FOPT',
    0xF01F: 'FOPT', 0xF020: 'FOPT', 0xF021: 'FOPT', 0xF022: 'FOPT',
    0xF023: 'FOPT', 0xF024: 'FOPT', 0xF025: 'FOPT', 0xF026: 'FOPT',
    0xF027: 'FOPT', 0xF028: 'FOPT', 0xF029: 'FOPT', 0xF02A: 'FOPT',
    0xF11E: 'FOPT', 0xF121: 'FOPT', 0xF122: 'FOPT',
    0xF00B: 'OPT',
    0xF004: 'SpContainer',
}
for t in (0xF004,):
    NAMES[t] = 'SpContainer'

def walk(data, off, end, depth, out):
    for (pos, ver, inst, rtype, rlen, p) in recs(data, off, end):
        out.append(('  '*depth + f'{NAMES.get(rtype, hex(rtype))} ver={ver} inst={inst} len={rlen} @{pos}', p, rlen))
        if rtype in (0xF000, 0xF001, 0xF002, 0xF003, 0xF004, 0xF006, 0xF007, 0xF008):
            walk(data, p, p+rlen, depth+1, out)

for path in sorted(glob.glob(r'C:\Users\User\.dsh\attachments\v1\files\**\*.doc', recursive=True)):
    name = os.path.basename(path)
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    fl = struct.unpack_from('<H', wd, 0x0A)[0]
    tn = '1Table' if (fl >> 9) & 1 else '0Table'
    tbl = ole.openstream(tn).read()
    ole.close()
    print('='*90)
    print(name)
    # locate DggContainer start (0xF002 or 0xF000) at top level
    start = None
    for pat in (b'\x0f\x00\x02\xf0', b'\x0f\x00\x00\xf0'):
        i = tbl.find(pat)
        if i >= 0:
            start = i
            break
    print('  dgg start', start)
    if start is None:
        continue
    out = []
    walk(tbl, start, len(tbl), 0, out)
    for line in out[:200]:
        print('   ', line[0])
