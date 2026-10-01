import olefile, struct, sys

def load(p):
    ole = olefile.OleFileIO(p)
    wd = ole.openstream('WordDocument').read()
    tn = '1Table' if ole.exists('1Table') else '0Table'
    tab = ole.openstream(tn).read()
    return wd, tab

def fkp(p, pn, show=True):
    wd, tab = load(p)
    base = pn * 512
    page = wd[base:base + 512]
    crun = page[511]
    rgfc = [struct.unpack_from('<I', page, k * 4)[0] for k in range(crun + 1)]
    print('PAGE', pn, 'base', base, 'crun', crun)
    print('  rgfc', [hex(x) for x in rgfc])
    bxs = []
    off = 4 * (crun + 1)
    for j in range(crun):
        bO = page[off + j * 13]
        phe = page[off + j * 13 + 1:off + j * 13 + 13]
        bxs.append(bO)
        print('  BX[%d] at %d bOffset=%3d -> papxOff=%4d page[papxOff]=0x%02X' %
              (j, off + j * 13, bO, bO * 2, page[bO * 2]))
    print('  PAPX data starts at', off + crun * 13)
    if show:
        print('  PAPX region bytes [%d:512]:' % (off + crun * 13))
        d = page[off + crun * 13:]
        print('   ', d[:200].hex())
    return page, crun, rgfc, bxs

if __name__ == '__main__':
    p = sys.argv[1]
    pns = [int(x) for x in sys.argv[2:]]
    for pn in pns:
        fkp(p, pn)
        print()
