import olefile, struct, glob, os

def rd(data, pos):
    ver_inst, rtype, rlen = struct.unpack_from('<HHI', data, pos)
    return (ver_inst & 0x0F), (ver_inst >> 4), rtype, rlen, pos + 8

NAMES = {
    0xF000: 'DggContainer', 0xF001: 'BStoreContainer', 0xF002: 'Dgg',
    0xF003: 'BSE', 0xF004: 'SpContainer', 0xF006: 'Dgg', 0xF007: 'BStore',
    0xF008: 'FDGG', 0xF009: 'FBSE', 0xF00A: 'FOPT', 0xF00B: 'FOPT',
    0xF010: 'ClientAnchor', 0xF011: 'ClientData', 0xF122: 'FOPT',
    0xF121: 'FOPT', 0xF00B: 'FOPT(Sp)', 0xF00A: 'OPT(FSP)',
}

TYPES = {
    0x0001: 'msofbtNone?', 0x0002: 'msofbtSp?',
}

def walk(data, start, end, depth, out, limit):
    pos = start
    while pos + 8 <= end and len(out) < limit:
        ver, inst, rtype, rlen, p = rd(data, pos)
        name = NAMES.get(rtype, f'0x{rtype:04X}')
        payload = data[p:p+rlen]
        out.append((depth, name, rtype, ver, inst, rlen, p, payload))
        if rtype in (0xF000, 0xF001, 0xF002, 0xF003, 0xF004, 0xF006, 0xF007, 0xF008):
            walk(data, p, p+rlen, depth+1, out, limit)
        pos = p + rlen

def parse_opt(payload, version=3):
    """Parse FOPT property table: instance = number of properties."""
    props = {}
    k = 0
    while k + 6 <= len(payload):
        pid, val = struct.unpack_from('<HI', payload, k)
        k += 6
        props[pid] = val
        if pid == 0 and k % 6 != 0:
            break
    return props

AH = {0: 'msosptNotPrimitive',1:'msosptRectangle',2:'msosptRoundRectangle',3:'msosptEllipse',
      4:'msosptDiamond',5:'msosptIsocelesTriangle',6:'msosptRightTriangle',7:'msosptParallelogram',
      8:'msosptTrapezoid',9:'msosptHexagon',10:'msosptOctagon',11:'msosptPlus',12:'msosptStar',
      13:'msosptArrow',14:'msosptThickArrow',15:'msosptHomePlate',16:'msosptCube',17:'msosptBalloon',
      18:'msosptSeal',19:'msosptArc',20:'msosptLine',21:'msosptPlaque',22:'msosptCan',23:'msosptDonut',
      24:'msosptTextSimple',25:'msosptTextOctagon',26:'msosptTextHexagon',27:'msosptTextCurve',
      28:'msosptTextWave',29:'msosptTextRing',30:'msosptTextArch',31:'msosptTextTriangle'}

for path in sorted(glob.glob(r'C:\Users\User\.dsh\attachments\v1\files\**\*.doc', recursive=True)):
    name = os.path.basename(path)
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    fl = struct.unpack_from('<H', wd, 0x0A)[0]
    tn = '1Table' if (fl >> 9) & 1 else '0Table'
    tbl = ole.openstream(tn).read()
    ole.close()
    print('='*100)
    print(name)
    out = []
    start = tbl.find(b'\x0f\x00\x02\xf0')
    if start < 0:
        start = tbl.find(b'\x0f\x00\x00\xf0')
    walk(tbl, start, len(tbl), 0, out, 400)
    for (depth, nm, rtype, ver, inst, rlen, p, payload) in out:
        line = f'{"  "*depth}{nm} ver={ver} inst={inst} len={rlen}'
        if nm in ('FOPT', 'FOPT(Sp)') and rlen >= 6:
            props = {}
            k = 0
            while k + 6 <= rlen:
                pid, val = struct.unpack_from('<HI', payload, k)
                if pid == 0 and k > 0:
                    break
                props[pid] = val
                k += 6
            line += '  props=' + ', '.join(f'{k2}:{v}' for k2, v in props.items())
        if nm == 'ClientAnchor':
            vals = struct.unpack_from('<HHHHH', payload, 0)
            line += f'  (flags={vals[0]} xaLeft={vals[1]} yaTop={vals[2]} xaRight={vals[3]} yaBottom={vals[4]})'
        if nm == 'ClientData' and rlen >= 4:
            line += f'  raw={payload.hex(" ")}'
        if nm == 'FDGG' or nm == 'FBSE':
            line += f'  raw={payload.hex(" ")}'
        print(line)
