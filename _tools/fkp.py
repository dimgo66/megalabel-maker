import olefile, struct, sys, os

path = sys.argv[1]
ole = olefile.OleFileIO(path)
wd = ole.openstream('WordDocument').read()
flags = struct.unpack_from('<H', wd, 0x0A)[0]
tname = '1Table' if (flags >> 9) & 1 else '0Table'
tbl = ole.openstream(tname).read()
ole.close()

print('cbRgFcLcb raw @0x98:', wd[0x98:0x9A].hex(' '), '=', struct.unpack_from('<H', wd, 0x98)[0])
print('FIB[0x9A:0x1B0]:', wd[0x9A:0x1B0].hex(' '))

def pair(i):
    return struct.unpack_from('<II', wd, 0x9A + i*8)

fcP, lcbP = pair(13)
print('fcPlcfbtePapx', fcP, lcbP)
plc = tbl[fcP:fcP+lcbP]
print('plc hex:', plc.hex(' '))
n = (lcbP - 4) // 8
print('n pages', n)
pns = [struct.unpack_from('<I', plc, (n+1)*4 + k*4)[0] for k in range(n)]
print('pns', pns)
fcs = [struct.unpack_from('<I', plc, k*4)[0] for k in range(n+1)]
print('fcs', fcs)

for pn in pns:
    off = pn*512
    page = wd[off:off+512]
    print(f'--- FKP page pn={pn} off={off} len={len(page)}')
    if len(page) < 512: 
        print('   short'); continue
    crun = page[511]
    print('   crun', crun)
    rgfc = [struct.unpack_from('<I', page, j*4)[0] for j in range(crun+1)]
    print('   rgfc', rgfc)
    bxbase = 4*(crun+1)
    for j in range(crun):
        b = page[bxbase + j*13: bxbase + j*13 + 13]
        print(f'   para{j} fc={rgfc[j]}-{rgfc[j+1]} bx={b.hex(" ")} bOffset={b[0]}')
        boff = b[0]
        if boff == 0:
            print('      -> in Data stream (plain text)')
            continue
        po = boff*2
        print(f'      papx page bytes @{po}:', page[po:po+40].hex(' '))
