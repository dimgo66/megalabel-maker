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
page = wd[pns[0]*512:(pns[0]+1)*512]
crun = page[511]
bxbase = 4*(crun+1)

print('crun', crun, 'bxbase', bxbase)
for j in range(crun):
    b = page[bxbase+j*13]
    print(f'  BX{j}: bOffset={b} (0x{b:02x}) po={b*2}')

po = 254
print(f'bytes {po-4}..{po+70}:')
for i in range(po-4, po+70):
    print(f'  [{i}] 0x{page[i]:02x}')

def decode(grp, start=0):
    out = []
    k = start
    while k + 2 <= len(grp):
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
            if k >= len(grp):
                break
            b = grp[k]
            if b == 0xFF:
                sz = 2 + struct.unpack_from('<H', grp, k+1)[0]
                k += 3
            else:
                sz = 1 + b
                k += 1
            out.append((k-1, sprm, grp[k:k+sz]))
            k += sz
            continue
        out.append((k-2, sprm, grp[k:k+sz]))
        k += sz
    return out, k

for start in (260, 262, 257, 255):
    grp = page[start:450]
    try:
        out, end = decode(grp)
        print(f'--- grpprl start={start} (page offset) decoded to {start+end} of 450')
        for (off, sprm, op) in out:
            print(f'    @{start+off} sprm=0x{sprm:04x} len={len(op)} op={op.hex(" ")}')
    except Exception as e:
        print('   decode error', start, e)
