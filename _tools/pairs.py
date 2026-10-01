import olefile, struct, glob, os, sys

def streams(path):
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    flags = struct.unpack_from('<H', wd, 0x0A)[0]
    which = (flags >> 9) & 1
    tname = '1Table' if which else '0Table'
    if not ole.exists(tname):
        tname = '1Table' if ole.exists('1Table') else '0Table'
    tbl = ole.openstream(tname).read()
    ole.close()
    return wd, tbl, tname

def fib_pairs(wd):
    csw = struct.unpack_from('<H', wd, 0x20)[0]
    off = 0x22 + csw*2
    cslw = struct.unpack_from('<H', wd, off)[0]
    off += 2 + cslw*4
    cb = struct.unpack_from('<H', wd, off)[0]
    off += 2
    print(f'  csw={csw} cslw={cslw} cbRgFcLcb={cb} pairsOffset={off}')
    return {i: struct.unpack_from('<II', wd, off+i*8) for i in range(cb//8)}

path = sys.argv[1]
wd, tbl, tname = streams(path)
print('FILE', os.path.basename(path), 'wd', len(wd), 'tbl', len(tbl), tname)
p = fib_pairs(wd)
for i in sorted(p):
    print(f'  pair[{i:2}] fc={p[i][0]:6} lcb={p[i][1]:6}  end={p[i][0]+p[i][1]}')
