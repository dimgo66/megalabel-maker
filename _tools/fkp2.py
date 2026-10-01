import olefile, struct, sys

path = sys.argv[1]
ole = olefile.OleFileIO(path)
wd = ole.openstream('WordDocument').read()
flags = struct.unpack_from('<H', wd, 0x0A)[0]
tname = '1Table' if (flags >> 9) & 1 else '0Table'
tbl = ole.openstream(tname).read()
ole.close()

fcP, lcbP = struct.unpack_from('<II', wd, 0x9A + 13*8)
plc = tbl[fcP:fcP+lcbP]
n = (lcbP - 4)//8
pns = [struct.unpack_from('<I', plc, (n+1)*4 + k*4)[0] for k in range(n)]
print('pns', pns)
pn = pns[0]
page = wd[pn*512:(pn+1)*512]
crun = page[511]
print('crun', crun)
bxbase = 4*(crun+1)
for j in range(crun):
    bx = page[bxbase+j*13: bxbase+j*13+13]
    print(f'BX{j} @{bxbase+j*13} bOffset=0x{bx[0]:02x} ({bx[0]}) -> po={bx[0]*2}')

for po in sorted({page[bxbase+j*13]*2 for j in range(crun)} - {0}):
    print(f'--- around po={po}')
    for o in range(po-2, po+8):
        print(f'   page[{o}] = 0x{page[o]:02x}')
